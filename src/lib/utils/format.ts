/**
 * Formatting utilities
 */

/**
 * Format relative time from a date
 */
export function timeAgo(dateInput: string | number | Date): string {
	const date = new Date(dateInput);
	// An unknown time (NaN timestamp, invalid date) is shown as such, never as "NaNd".
	if (!Number.isFinite(date.getTime())) return 'undated';
	const now = new Date();
	const deltaSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
	const future = deltaSeconds < 0;
	const seconds = Math.abs(deltaSeconds);

	if (seconds < 60) return future ? 'soon' : 'just now';
	if (seconds < 3600) {
		const minutes = Math.floor(seconds / 60);
		return future ? `in ${minutes}m` : `${minutes}m`;
	}
	if (seconds < 86400) {
		const hours = Math.floor(seconds / 3600);
		return future ? `in ${hours}h` : `${hours}h`;
	}
	const days = Math.floor(seconds / 86400);
	return future ? `in ${days}d` : `${days}d`;
}

const PACIFIC_DATE_TIME = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
	timeZone: 'America/Los_Angeles',
	timeZoneName: 'short'
});

/** An ISO time as a Pacific date and time ("Oct 1, 7:59 PM PDT"), or null if unreadable. */
export function formatPacificDateTime(iso: string | undefined): string | null {
	const t = iso ? Date.parse(iso) : NaN;
	return Number.isFinite(t) ? PACIFIC_DATE_TIME.format(t) : null;
}
