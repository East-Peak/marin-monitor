/**
 * localStorage access that never throws.
 *
 * Storage can be unavailable (Safari private mode, blocked site data, SSR) or
 * full (QuotaExceededError). Preferences are a convenience, so every failure
 * degrades to "nothing persisted": reads return null, writes and removes
 * return false.
 */

export function safeGetItem(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function safeSetItem(key: string, value: string): boolean {
	try {
		localStorage.setItem(key, value);
		return true;
	} catch {
		return false;
	}
}

export function safeRemoveItem(key: string): boolean {
	try {
		localStorage.removeItem(key);
		return true;
	} catch {
		return false;
	}
}
