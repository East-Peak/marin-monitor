/**
 * Scrapers whose targets block datacenter IPs (Toast, Instacart, PlumpJack,
 * Ikon, Thumbtack) run on the Mac mini via launchd, not GitHub Actions
 * (decided 2026-09-29). These tests keep the launchd wiring coherent and make
 * sure no source ever has two writers.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const LOCAL_JOBS = [
	'coffee-index',
	'cappuccino',
	'grocery-basket',
	'wine-index',
	'ikon-pass',
	'dog-walker'
];
const runner = read('scripts/sync-runner.sh');
const manager = read('scripts/manage-sync.sh');

describe('residential syncs on launchd', () => {
	it.each(LOCAL_JOBS)('%s has a calendar-scheduled plist that calls sync-runner', (job) => {
		const plist = read(`scripts/launchd/com.marin-monitor.sync-${job}.plist`);
		expect(plist).toContain(`<string>com.marin-monitor.sync-${job}</string>`);
		expect(plist).toContain('scripts/sync-runner.sh</string>');
		expect(plist).toContain(`<string>${job}</string>`);
		expect(plist).toContain('<key>StartCalendarInterval</key>');
		expect(plist).not.toContain('<key>RunAtLoad</key>');
	});

	it.each(LOCAL_JOBS)('%s is a residential job in sync-runner with a script on disk', (job) => {
		expect(runner).toMatch(new RegExp(`\\b${job}\\b[^\\n]*\\)\\n\\s+unset SCRAPE_PROXY_URL`));
		expect(existsSync(join(ROOT, `scripts/sync-${job}.mjs`))).toBe(true);
	});

	it('manage-sync installs every plist in scripts/launchd', () => {
		const plists = readdirSync(join(ROOT, 'scripts/launchd')).map((f) => f.replace(/\.plist$/, ''));
		for (const name of plists) expect(manager).toContain(`"${name}"`);
	});

	it('gives residential jobs the blob token only, never the scrape proxy', () => {
		expect(runner).toMatch(/unset SCRAPE_PROXY_URL SCRAPE_PROXY_SECRET/);
		expect(runner).toMatch(/grep '\^BLOB_READ_WRITE_TOKEN='/);
		expect(runner).not.toMatch(/source .*\.env/);
	});

	it.each(LOCAL_JOBS)('%s has no GitHub workflow (one writer per blob)', (job) => {
		expect(existsSync(join(ROOT, `.github/workflows/sync-${job}.yml`))).toBe(false);
		expect(read('.github/workflows/sync-keepalive.yml')).not.toContain(`sync-${job}.yml`);
	});

	it('coffee and cappuccino finish before the Monday composite cron reads them', () => {
		// vercel.json: sync-composite at 14:00 UTC Monday = 06:00/07:00 Pacific.
		expect(read('vercel.json')).toMatch(
			/"path": "\/api\/cron\/sync-composite", "schedule": "0 14 \* \* 1"/
		);
		for (const job of ['coffee-index', 'cappuccino']) {
			const plist = read(`scripts/launchd/com.marin-monitor.sync-${job}.plist`);
			expect(plist).toMatch(/<key>Weekday<\/key>\s*<integer>1<\/integer>/);
			const hour = Number(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/.exec(plist)?.[1]);
			expect(hour, job).toBeLessThan(5);
		}
	});

	it('kills a hung residential job instead of blocking every later run', () => {
		expect(runner).toMatch(/run_with_timeout \d+ node scripts\/sync-\$\{JOB\}\.mjs/);
		expect(runner).toMatch(/kill -TERM "\$pid"/);
	});

	it('fails loudly when .env.local has no blob token', () => {
		expect(runner).toMatch(
			/\[\[ -n "\$BLOB_READ_WRITE_TOKEN" \]\] \|\| \{ echo .*BLOB_READ_WRITE_TOKEN.*; exit 1; \}/
		);
	});
});
