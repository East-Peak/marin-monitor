/**
 * Test helper: the sanitised Postmark fixtures (tests/fixtures/postmark, built from 2026-11-14's
 * real samples with personal and tracking values stripped). The inbound address is a fixed fake.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/postmark');
export const FAKE_INBOUND = '00000000000000000000000000000000@inbound.postmarkapp.com';

export const fixtureNames = () =>
	readdirSync(FIXTURE_DIR)
		.filter((f) => f.endsWith('.json'))
		.map((f) => f.replace(/\.json$/, ''));

export const fixtureText = (name: string) =>
	readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8');

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures are mutated freely in tests
export const fixture = (name: string): any => JSON.parse(fixtureText(name));
