/**
 * Why a source failed, in a reader's words (plan-text-system.md rule 7). The kind is read once,
 * where the failure enters the model, from the typed code its catch site recorded: the news
 * producer's and the goldengate.org sync's `<BoundedFetchFailure>: detail`, a dataset's or 511
 * read's thrown error. The raw diagnostic stays in /api/health; readers only ever see the words.
 */
export const FAILURE_KINDS = [
	'redirect-rejected',
	'http-error',
	'timeout',
	'parse-failed',
	'empty',
	'unknown'
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** The producer's and sync's own codes (BoundedFetchFailure and ingest's), read only as the code. */
const CODES: Readonly<Record<string, FailureKind>> = {
	'redirect-not-allowed': 'redirect-rejected',
	'too-many-redirects': 'redirect-rejected',
	'http-status': 'http-error',
	timeout: 'timeout',
	parse: 'parse-failed',
	'too-large': 'parse-failed',
	empty: 'empty'
};
/** `<code>: detail`, alone or quoted by the health report as "(last error: <code>: …)". */
const CODED = /(?:^|\(last error: )([a-z][a-z-]*): /;
/** The client's own thrown errors, whole-message shapes only: never a word inside a URL. */
const THROWN: readonly (readonly [FailureKind, RegExp])[] = [
	[
		'timeout',
		/: timed out after \d+ ms$|^The operation was aborted due to timeout$|^TimeoutError\b/
	],
	['http-error', /(?:^|: )HTTP \d{3}$|(?:^|: )Transit proxy failed for \w+: \d{3}$/],
	['parse-failed', /^Unexpected token .* in JSON\b|^Unexpected end of JSON input$/]
];

export function failureKindOf(diagnostic: string | null | undefined): FailureKind {
	if (!diagnostic) return 'unknown';
	// A read's own name ("transit: …") is not a code: its message is judged by shape instead.
	const code = CODED.exec(diagnostic)?.[1];
	if (code !== undefined && code in CODES) return CODES[code];
	return THROWN.find(([, shape]) => shape.test(diagnostic))?.[0] ?? 'unknown';
}

/** Conservative: what we couldn't do, never when it started or what the source did or didn't publish. */
export const FAILURE_WORDS: Readonly<Record<FailureKind, string>> = {
	'redirect-rejected': "we couldn't follow this feed's redirect",
	'http-error': 'the source returned an error',
	timeout: "the source didn't answer in time",
	'parse-failed': "we couldn't read what the source sent",
	empty: 'the source sent nothing',
	unknown: "we couldn't check this source"
};
