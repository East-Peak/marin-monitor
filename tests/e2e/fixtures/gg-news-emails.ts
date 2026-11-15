import { readFileSync } from 'node:fs';
import type { EmailIntakeRead } from '../../../src/lib/email-intake';
import { createMemoryBlobApi } from '../../../src/lib/server/news/memory-blob-api';
import { parsePostmark } from '../../../src/lib/server/email-intake/postmark';
import { ingestEmail, readEmailIntake } from '../../../src/lib/server/email-intake/store';

const DAY = 24 * 60 * 60_000;
const INBOUND = '00000000000000000000000000000000@inbound.postmarkapp.com';

/**
 * Golden Gate's October newsletter and November meeting reminder (the sanitised fixtures in
 * tests/fixtures/postmark), sent two days and one day before `now` instead of in 2026-10/11,
 * stored and read back through the intake itself: the read the dashboard's route serves.
 */
export async function newsEmailsRead(now: number): Promise<EmailIntakeRead> {
	const api = createMemoryBlobApi();
	const signal = new AbortController().signal;
	for (const [name, daysAgo] of [
		['newsletter-october', 2],
		['public-meeting-reminder', 1]
	] as const) {
		const mail = JSON.parse(readFileSync(`tests/fixtures/postmark/${name}.json`, 'utf8'));
		const posted = parsePostmark({ ...mail, Date: new Date(now - daysAgo * DAY).toUTCString() });
		if (!posted) throw new Error(`${name}: not a valid Postmark message`);
		await ingestEmail(posted, { api, inbound: INBOUND, now: () => new Date(now), signal });
	}
	return readEmailIntake({ api, now: () => new Date(now), signal });
}
