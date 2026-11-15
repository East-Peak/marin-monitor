/**
 * Client-side reader for Golden Gate's alert emails (email intake v1): the public read the
 * intake serves. A body that isn't a valid read is a failed read, never an empty list.
 */
import { isEmailIntakeRead, type EmailIntakeRead } from '$lib/email-intake';
import { createDataFetcherWithStatus } from './data-fetcher';

export const fetchEmailIntakeWithStatus = createDataFetcherWithStatus<EmailIntakeRead | null>(
	'/api/data/email-intake',
	'Email intake',
	null,
	(body) => {
		if (!isEmailIntakeRead(body)) throw new Error('email-intake: not a valid read');
		return body;
	}
);
