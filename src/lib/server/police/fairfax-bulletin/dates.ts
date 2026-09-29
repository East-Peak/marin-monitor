/** Calendar dates as ISO `YYYY-MM-DD` strings; invalid dates are null. */

export function isoDate(year: number, month: number, day: number): string | null {
	const date = new Date(Date.UTC(year, month - 1, day));
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) return null;
	if (date.getUTCDate() !== day) return null;
	return date.toISOString().slice(0, 10);
}

/** `MM/DD/YYYY` as printed in the bulletin header. */
export function parseUsDate(value: string): string | null {
	const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
	return match ? isoDate(+match[3], +match[1], +match[2]) : null;
}

export function daysBetween(start: string, end: string): number {
	return (Date.parse(end) - Date.parse(start)) / 86_400_000;
}
