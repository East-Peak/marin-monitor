// @ts-check
/**
 * What the published-series syncs share (COSTDATA-1): read a publisher's PDF
 * as text, and write one blob whose `current` carries its own times. A sync
 * that cannot vouch for its read throws and writes nothing, so the last good
 * read keeps its own (aging) times; there is never a fallback value.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { put } from '@vercel/blob';

export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) MarinMonitor/1.0';

/** @param {string} url @returns {Promise<Response>} */
export async function get(url) {
	return fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) });
}

/** A PDF's text, laid out (`pdftotext -layout`, poppler from Homebrew). */
export async function pdfText(/** @type {Response} */ response) {
	const dir = mkdtempSync(join(tmpdir(), 'marin-pdf-'));
	try {
		const file = join(dir, 'doc.pdf');
		writeFileSync(file, Buffer.from(await response.arrayBuffer()));
		return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * @param {string} blobKey
 * @param {{ url: string, period: string, periodEnd?: string, validUntil?: string, values: Record<string, number>, [k: string]: unknown }} read
 */
export async function writePublished(blobKey, read) {
	const token = process.env.BLOB_READ_WRITE_TOKEN;
	if (!token) throw new Error('BLOB_READ_WRITE_TOKEN not set');
	const at = new Date().toISOString();
	const current = { timestamp: at, lastSuccessfulScrapeAt: at, ...read };
	await put(blobKey, JSON.stringify({ current }), {
		access: 'private',
		contentType: 'application/json',
		addRandomSuffix: false,
		allowOverwrite: true,
		token
	});
	return current;
}

/** Run a sync: log its result, or fail the job without writing anything. */
export async function run(/** @type {string} */ name, /** @type {() => Promise<unknown>} */ sync) {
	try {
		console.log(`[${name}] ${JSON.stringify(await sync())}`);
	} catch (err) {
		console.error(`[${name}] FAILED, nothing written:`, err instanceof Error ? err.message : err);
		process.exitCode = 1;
	}
}
