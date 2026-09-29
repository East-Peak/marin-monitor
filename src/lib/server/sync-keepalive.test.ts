/**
 * GitHub disables scheduled workflows in a public repo after 60 days without
 * repository activity — that silently stopped all 8 sync jobs in 2026. The
 * keepalive workflow re-enables every sync workflow (and itself) weekly via
 * the API, with no commits — weekly so one dropped run cannot reach 60 days.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), '.github/workflows');
const KEEPALIVE = 'sync-keepalive.yml';
const read = (file: string) => readFileSync(join(DIR, file), 'utf8');

describe('sync keepalive workflow', () => {
	it('runs weekly, off the top of the hour, and on demand', () => {
		const yml = read(KEEPALIVE);
		const cron = /schedule:\s*\n\s*- cron: '([^']+)'/.exec(yml)?.[1] ?? '';
		const [minute, , dayOfMonth, month, dayOfWeek] = cron.split(' ');
		expect([dayOfMonth, month]).toEqual(['*', '*']);
		expect(dayOfWeek).toMatch(/^[0-6]$/);
		expect(Number(minute)).not.toBe(0);
		expect(yml).toContain('workflow_dispatch:');
	});

	it('tries every workflow before failing, instead of stopping at the first error', () => {
		const yml = read(KEEPALIVE);
		expect(yml).toMatch(/if ! gh workflow enable "\$workflow"/);
		expect(yml).toMatch(/exit "\$failed"|exit \$failed/);
	});

	it('holds only actions: write — nothing else', () => {
		const yml = read(KEEPALIVE);
		const block = /^permissions:\n((?: {2}.+\n)+)/m.exec(yml)?.[1] ?? '';
		expect(
			block
				.trim()
				.split('\n')
				.map((l) => l.trim())
		).toEqual(['actions: write']);
		expect(yml).not.toMatch(/actions\/checkout/);
	});

	it('re-enables every sync workflow in the repo, including itself', () => {
		const yml = read(KEEPALIVE);
		const listed = [...yml.matchAll(/^\s+(sync-[\w-]+\.yml)\s*\\?$/gm)].map((m) => m[1]).sort();
		const onDisk = readdirSync(DIR)
			.filter((f) => f.startsWith('sync-') && f.endsWith('.yml'))
			.sort();
		expect(onDisk).toContain(KEEPALIVE);
		expect(listed).toEqual(onDisk);
	});
});
