// src/routes/api/health/health.test.ts
//
// Tests for the /api/health server-route endpoint.
// The health endpoint:
//   1. Checks freshness of all monitored data sources (blob storage)
//   2. Returns { status: "healthy" | "degraded" } with per-source details
//   3. Includes internal info (API keys, proxy) only when cron auth is present
//   4. No auth required for basic health check

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────
// Module-level mocks (must precede dynamic imports)
// ──────────────────────────────────────────────────────────

const mockReadBlobFreshnessTimestamp = vi.fn();
const mockFetchWithTimeout = vi.fn();

vi.mock('@vercel/blob', () => ({
	head: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		BLOB_READ_WRITE_TOKEN: 'test-token',
		CRON_SECRET: 'test-cron-secret',
		GOOGLE_PLACES_API_KEY: 'gp-key',
		NREL_API_KEY: '',
		OPEN_CHARGE_MAP_API_KEY: 'ocm-key',
		API_511_KEY: '511-key',
		SCRAPE_PROXY_URL: '',
		SCRAPE_PROXY_SECRET: ''
	}
}));

vi.mock('$lib/server/blob-freshness', () => ({
	readBlobFreshnessTimestamp: mockReadBlobFreshnessTimestamp
}));

vi.mock('$lib/server/fetch-utils', () => ({
	fetchWithTimeout: mockFetchWithTimeout
}));

// ──────────────────────────────────────────────────────────
// Dynamic import (resolved after mocks are wired)
// ──────────────────────────────────────────────────────────

const { GET: getHealth, _DATA_SOURCES } = await import('./+server');

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function makeEvent(authHeader?: string) {
	const headers = new Headers();
	if (authHeader) {
		headers.set('authorization', authHeader);
	}
	return { request: new Request('https://localhost/api/health', { headers }) } as any;
}

function publicEvent() {
	return makeEvent();
}

function authedEvent() {
	return makeEvent('Bearer test-cron-secret');
}

// ──────────────────────────────────────────────────────────
// Reset mocks
// ──────────────────────────────────────────────────────────

beforeEach(() => {
	mockReadBlobFreshnessTimestamp.mockReset();
	mockFetchWithTimeout.mockReset();
});

// ──────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────

describe('/api/health', () => {
	it('returns 200 with status field', async () => {
		// All sources fresh
		mockReadBlobFreshnessTimestamp.mockResolvedValue({
			uploadedAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString()
		});

		const response = await getHealth(publicEvent());
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.status).toBe('healthy');
	});

	it('returns correct JSON shape with summary and sources', async () => {
		mockReadBlobFreshnessTimestamp.mockResolvedValue({
			uploadedAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString()
		});

		const response = await getHealth(publicEvent());
		const data = await response.json();

		// Top-level fields
		expect(data).toHaveProperty('status');
		expect(data).toHaveProperty('timestamp');
		expect(data).toHaveProperty('summary');
		expect(data).toHaveProperty('sources');

		// Summary shape
		expect(data.summary).toHaveProperty('total');
		expect(data.summary).toHaveProperty('ok');
		expect(data.summary).toHaveProperty('stale');
		expect(data.summary).toHaveProperty('error');
		expect(typeof data.summary.total).toBe('number');
		expect(data.summary.total).toBe(_DATA_SOURCES.length);

		// Sources is an array matching DATA_SOURCES length
		expect(Array.isArray(data.sources)).toBe(true);
		expect(data.sources.length).toBe(_DATA_SOURCES.length);
	});

	it('returns Content-Type application/json', async () => {
		mockReadBlobFreshnessTimestamp.mockResolvedValue({
			uploadedAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString()
		});

		const response = await getHealth(publicEvent());
		expect(response.headers.get('Content-Type')).toBe('application/json');
	});

	it('returns Cache-Control: no-cache', async () => {
		mockReadBlobFreshnessTimestamp.mockResolvedValue({
			uploadedAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString()
		});

		const response = await getHealth(publicEvent());
		expect(response.headers.get('Cache-Control')).toBe('no-cache');
	});

	it('returns "degraded" when a source is stale', async () => {
		// Return a very old timestamp so it exceeds maxAgeDays
		const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
		mockReadBlobFreshnessTimestamp.mockResolvedValue({
			uploadedAt: oldDate,
			lastUpdated: oldDate
		});

		const response = await getHealth(publicEvent());
		const data = await response.json();

		expect(data.status).toBe('degraded');
		expect(data.summary.stale).toBeGreaterThan(0);
	});

	it('returns "degraded" when a source blob is missing', async () => {
		mockReadBlobFreshnessTimestamp.mockRejectedValue(new Error('blob not found'));

		const response = await getHealth(publicEvent());
		const data = await response.json();

		expect(data.status).toBe('degraded');
		expect(data.summary.error).toBeGreaterThan(0);
	});

	it('each source entry has the expected fields', async () => {
		mockReadBlobFreshnessTimestamp.mockResolvedValue({
			uploadedAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString()
		});

		const response = await getHealth(publicEvent());
		const data = await response.json();

		const source = data.sources[0];
		expect(source).toHaveProperty('name');
		expect(source).toHaveProperty('blobKey');
		expect(source).toHaveProperty('lastUpdated');
		expect(source).toHaveProperty('expectedCadence');
		expect(source).toHaveProperty('maxAgeDays');
		expect(source).toHaveProperty('isStale');
		expect(source).toHaveProperty('ageDays');
		expect(source).toHaveProperty('status');
	});

	it('does NOT include internal info without cron auth', async () => {
		mockReadBlobFreshnessTimestamp.mockResolvedValue({
			uploadedAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString()
		});

		const response = await getHealth(publicEvent());
		const data = await response.json();

		expect(data.internal).toBeUndefined();
	});

	it('includes internal info (apiKeys) when cron auth is present', async () => {
		mockReadBlobFreshnessTimestamp.mockResolvedValue({
			uploadedAt: new Date().toISOString(),
			lastUpdated: new Date().toISOString()
		});

		const response = await getHealth(authedEvent());
		const data = await response.json();

		expect(data.internal).toBeDefined();
		expect(data.internal.apiKeys).toBeDefined();
		expect(Array.isArray(data.internal.apiKeys)).toBe(true);

		// Check that API key availability is reported correctly
		const gpKey = data.internal.apiKeys.find(
			(k: { name: string }) => k.name === 'GOOGLE_PLACES_API_KEY'
		);
		expect(gpKey?.set).toBe(true);

		const nrelKey = data.internal.apiKeys.find(
			(k: { name: string }) => k.name === 'NREL_API_KEY'
		);
		expect(nrelKey?.set).toBe(false);
	});
});
