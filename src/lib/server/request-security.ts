import { timingSafeEqual } from 'node:crypto';

type RateLimitBucket = {
	count: number;
	resetAt: number;
};

type RateLimitResult = {
	allowed: boolean;
	remaining: number;
	retryAfterSec: number;
};

const RATE_LIMITS_KEY = '__marin_monitor_rate_limits__';

function toBuffer(value: string): Buffer {
	return Buffer.from(value, 'utf8');
}

function getRateLimitStore(): Map<string, RateLimitBucket> {
	const globalState = globalThis as typeof globalThis & {
		[RATE_LIMITS_KEY]?: Map<string, RateLimitBucket>;
	};
	if (!globalState[RATE_LIMITS_KEY]) {
		globalState[RATE_LIMITS_KEY] = new Map<string, RateLimitBucket>();
	}
	return globalState[RATE_LIMITS_KEY];
}

export function safeEquals(
	expected: string | null | undefined,
	actual: string | null | undefined
): boolean {
	if (!expected || !actual) return false;
	const expectedBuf = toBuffer(expected);
	const actualBuf = toBuffer(actual);
	if (expectedBuf.length !== actualBuf.length) return false;
	return timingSafeEqual(expectedBuf, actualBuf);
}

export function isTrustedMutationRequest(request: Request, origin: string): boolean {
	const requestOrigin = request.headers.get('origin');
	if (requestOrigin) {
		return requestOrigin === origin;
	}

	const secFetchSite = request.headers.get('sec-fetch-site');
	if (!secFetchSite) return true;
	return secFetchSite === 'same-origin' || secFetchSite === 'same-site' || secFetchSite === 'none';
}

export function isJsonRequest(request: Request): boolean {
	const contentType = request.headers.get('content-type') ?? '';
	return contentType.toLowerCase().includes('application/json');
}

export function getClientIp(
	request: Request,
	getClientAddress?: (() => string) | undefined
): string {
	const forwardedFor = request.headers.get('x-forwarded-for');
	if (forwardedFor) {
		return forwardedFor.split(',')[0].trim();
	}

	const headerIp =
		request.headers.get('x-real-ip') ??
		request.headers.get('cf-connecting-ip') ??
		request.headers.get('x-vercel-forwarded-for');
	if (headerIp) {
		return headerIp.trim();
	}

	try {
		const directIp = getClientAddress?.();
		if (directIp) return directIp.trim();
	} catch {
		// Ignore adapter-specific failures and fall back to an opaque identifier.
	}

	return 'unknown';
}

export function redactIp(ip: string): string {
	if (!ip || ip === 'unknown') return 'unknown';
	if (ip.includes(':')) {
		const parts = ip.split(':').filter(Boolean);
		return `${parts.slice(0, 2).join(':')}:*`;
	}
	const parts = ip.split('.');
	if (parts.length === 4) {
		return `${parts[0]}.${parts[1]}.*.*`;
	}
	return `${ip.slice(0, 4)}*`;
}

export function checkRateLimit(options: {
	bucket: string;
	key: string;
	limit: number;
	windowMs: number;
	now?: number;
}): RateLimitResult {
	const { bucket, key, limit, windowMs, now = Date.now() } = options;
	const store = getRateLimitStore();

	if (store.size > 5000) {
		for (const [entryKey, entry] of store.entries()) {
			if (entry.resetAt <= now) store.delete(entryKey);
		}
	}

	const storeKey = `${bucket}:${key}`;
	const current = store.get(storeKey);
	if (!current || current.resetAt <= now) {
		store.set(storeKey, { count: 1, resetAt: now + windowMs });
		return {
			allowed: true,
			remaining: Math.max(limit - 1, 0),
			retryAfterSec: Math.ceil(windowMs / 1000)
		};
	}

	if (current.count >= limit) {
		return {
			allowed: false,
			remaining: 0,
			retryAfterSec: Math.max(Math.ceil((current.resetAt - now) / 1000), 1)
		};
	}

	current.count += 1;
	store.set(storeKey, current);
	return {
		allowed: true,
		remaining: Math.max(limit - current.count, 0),
		retryAfterSec: Math.max(Math.ceil((current.resetAt - now) / 1000), 1)
	};
}

export function resetRequestSecurityStateForTests(): void {
	getRateLimitStore().clear();
}
