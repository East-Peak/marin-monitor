/**
 * Bulletin wall-clock times are Fairfax local time (spec Decision 7). A time
 * repeated by the fall-back transition takes the earlier instant; a time
 * skipped by spring-forward is shifted forward by the gap.
 */
const ZONE = 'America/Los_Angeles';
const HOUR_MS = 3_600_000;

const wallFormat = new Intl.DateTimeFormat('en-US', {
	timeZone: ZONE,
	hourCycle: 'h23',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit'
});

/** The zone's UTC offset (ms) at an instant. */
function offsetAt(instant: number): number {
	const parts = Object.fromEntries(
		wallFormat.formatToParts(instant).map((part) => [part.type, Number(part.value)])
	);
	const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
	return asUtc - Math.floor(instant / 60_000) * 60_000;
}

/** `reportedDate` (YYYY-MM-DD) + `time` (HH:MM) in Fairfax → epoch ms. */
export function incidentTimestamp(reportedDate: string, time: string): number {
	const [year, month, day] = reportedDate.split('-').map(Number);
	const [hour, minute] = time.split(':').map(Number);
	const wall = Date.UTC(year, month - 1, day, hour, minute);
	// The offsets 12h either side cover both readings around any transition.
	const before = offsetAt(wall - 12 * HOUR_MS);
	const after = offsetAt(wall + 12 * HOUR_MS);
	const readings = [wall - before, wall - after].filter((at) => at + offsetAt(at) === wall);
	// No reading: the wall time was skipped; the pre-transition offset lands past the gap.
	return readings.length > 0 ? Math.min(...readings) : wall - before;
}
