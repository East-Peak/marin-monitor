/**
 * The change in the county regular average over `days`, shared by the legacy gas panel and v2.
 * The baseline is the newest snapshot at or before `current − days`, found by timestamp, so the
 * history's order (the blob serves it newest first) and its cadence don't matter. Null when no
 * snapshot is that old, or either average is missing: "not enough history", never a 0.
 */
export interface GasAverageReading {
	timestamp: string;
	avgRegular: number | null;
}

const DAY_MS = 86_400_000;

export function gasChangeOverDays(
	history: readonly GasAverageReading[],
	current: GasAverageReading | null,
	days: number
): number | null {
	if (current?.avgRegular == null) return null;
	const cutoff = Date.parse(current.timestamp) - days * DAY_MS;
	if (!Number.isFinite(cutoff)) return null;
	let baseline: { at: number; reading: GasAverageReading } | null = null;
	for (const reading of history) {
		const at = Date.parse(reading.timestamp);
		if (at <= cutoff && (!baseline || at > baseline.at)) baseline = { at, reading };
	}
	const before = baseline?.reading.avgRegular;
	return before == null ? null : current.avgRegular - before;
}
