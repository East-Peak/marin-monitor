import type { PageLoad } from './$types';

/**
 * The legacy layout's code loads only when it is the chosen layout (MOBILE1): a v2 visit never
 * downloads it. It was a static import of this page, about 110 KB gzipped of every phone's first
 * load. Legacy is the rollback path, so it alone pays the extra request.
 */
export const load: PageLoad = async ({ data }) => ({
	...data,
	LegacyDashboard:
		data.layout === 'legacy'
			? (await import('$lib/components/dashboard/LegacyDashboard.svelte')).default
			: null
});
