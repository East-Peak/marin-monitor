/**
 * The sync scrapers launch Chromium on GitHub runners. Two Playwright
 * versions in the tree (a direct `playwright` dep beside `@playwright/test`)
 * meant `npx playwright install` fetched one browser build while the scripts
 * launched another — every Coffee/Cappuccino run died at launch (G0, 2026-09).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('single Playwright version', () => {
	it('the lockfile resolves exactly one playwright and one playwright-core', () => {
		const lock = JSON.parse(read('package-lock.json')) as {
			packages: Record<string, { version?: string }>;
		};
		for (const name of ['playwright', 'playwright-core']) {
			const versions = new Set(
				Object.entries(lock.packages)
					.filter(([path]) => path.endsWith(`node_modules/${name}`))
					.map(([, entry]) => entry.version)
			);
			expect([...versions], name).toHaveLength(1);
		}
	});

	it('has no direct playwright dependency beside @playwright/test', () => {
		const pkg = JSON.parse(read('package.json'));
		const deps = { ...pkg.dependencies, ...pkg.devDependencies };
		expect(deps).not.toHaveProperty('playwright');
		expect(deps).toHaveProperty('@playwright/test');
	});

	it('scrapers import the browser from @playwright/test', () => {
		const scripts = readdirSync(join(ROOT, 'scripts')).filter((f) => f.endsWith('.mjs'));
		const offenders = scripts.filter((f) =>
			/(from |import\()['"]playwright['"]/.test(read(join('scripts', f)))
		);
		expect(offenders).toEqual([]);
	});

	it('every sync workflow that launches a browser installs it from the pinned package', () => {
		const dir = join(ROOT, '.github/workflows');
		for (const file of readdirSync(dir).filter((f) => f.startsWith('sync-'))) {
			const workflow = read(join('.github/workflows', file));
			const script = /node (scripts\/\S+\.mjs)/.exec(workflow)?.[1];
			if (!script || !read(script).includes('@playwright/test')) continue;
			const step = (cmd: string) =>
				workflow.search(
					new RegExp(`^\\s*- run: ${cmd.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*$`, 'm')
				);
			const [ci, install, run] = [
				'npm ci',
				'npx playwright install --with-deps chromium',
				`node ${script}`
			].map(step);
			expect(
				[ci, install, run].every((i) => i >= 0),
				file
			).toBe(true);
			expect(ci < install && install < run, file).toBe(true);
		}
	});
});
