/**
 * Formatting utilities
 */

/**
 * Format relative time from a date
 */
export function timeAgo(dateInput: string | number | Date): string {
	const date = new Date(dateInput);
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
