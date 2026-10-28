/**
 * One source's provenance line (plan-text-system.md rule 3): its name, then its time with the
 * verb that fits, or why there is none. Never a bare value. Colour is for attention only
 * (Stuart, 2026-10-28: provenance loses the always-green dot), so a current line carries none.
 */
import type { Measured } from './measured';
import { formatAsOf } from './pacific-time';

export interface SourceLine {
	measured: Measured<unknown>;
	/** How the time reads: "issued" (a forecast), "checked" (our read), "as of" (the payload's own). */
	verb?: string;
	/** Shown in place of a time when the source has none to give (e.g. a tide prediction). */
	untimed?: string;
	/** No freshness claim (a fixed estimate, a maintained list). */
	muted?: boolean;
}

export function provenance(
	{ measured: m, verb = 'as of', untimed }: SourceLine,
	now: number
): { text: string; attention: boolean } {
	switch (m.kind) {
		case 'loading':
			return { text: `${m.source} · loading…`, attention: false };
		case 'unknown':
			return { text: `${m.source} · unverified (${m.reason})`, attention: true };
		case 'unavailable':
			return { text: `${m.source} · unavailable (${m.reason})`, attention: true };
		case 'value': {
			const when =
				m.observedAt !== null
					? `${verb} ${formatAsOf(m.observedAt, now)}`
					: (untimed ?? 'time not reported');
			const kept = m.retainedAfter !== null;
			return {
				text: `${m.source} · ${when}${kept ? ` · out of date (${m.retainedAfter})` : ''}`,
				attention: kept
			};
		}
	}
}
