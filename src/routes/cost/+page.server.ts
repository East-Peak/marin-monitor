/**
 * /cost: every household side by side (COSTX1), from the same snapshot as /cost/<town>.
 * A 404 while the Lifestyle Index's flag is off, as each household's page is.
 */
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { COST_DATASETS } from '$lib/dashboard/cost';
import { compareHouseholds } from '$lib/lifestyle/compare';
import { offerCacheControl } from '$lib/lifestyle/offers';
import { SHEETS } from '$lib/lifestyle/sheets';
import { householdPage, pricedSoFar, townSlug } from '$lib/lifestyle/view';
import {
	highlightsOn,
	lifestyleBlobApi,
	lifestyleHighlights,
	lifestyleOn,
	readLifestyleDoc,
	snapshotStale
} from '$lib/server/lifestyle/read';
import type { PageServerLoad } from './$types';

const READ_MS = 8000;
const MAX_AGE_MS = COST_DATASETS.lifestyle.maxAgeDays * 86_400_000;

export const load: PageServerLoad = async ({ setHeaders }) => {
	if (!lifestyleOn(env)) error(404, 'Not found');

	const api = lifestyleBlobApi(env);
	const read = api ? await readLifestyleDoc(api, AbortSignal.timeout(READ_MS)) : null;
	const snapshot = read?.current ?? null;
	const columns = SHEETS.map((sheet) => {
		const budget = snapshot?.budgets.find((b) => b.town === sheet.id) ?? null;
		return { sheet, budget, page: budget ? householdPage(budget, sheet) : null };
	});
	const budgets = columns.flatMap((c) => (c.budget ? [c.budget] : []));
	// A failed or partial read is never edge-cached as the comparison.
	setHeaders({
		'Cache-Control':
			budgets.length === SHEETS.length
				? offerCacheControl(budgets, new Date(), 600, 3600)
				: 'private, no-store'
	});
	const highlights = read && highlightsOn(env) ? lifestyleHighlights(read, SHEETS) : null;
	const stale = snapshotStale(snapshot, MAX_AGE_MS);
	return {
		households: columns.map(({ sheet, page }) => {
			const h = page?.summary ?? null;
			return {
				id: sheet.id,
				slug: townSlug(sheet.town),
				town: sheet.town,
				name: sheet.name,
				who: sheet.who,
				read: !!h,
				burnMonthly: h?.burnMonthly ?? null,
				soFar: !!h && pricedSoFar(h),
				complete: h?.complete ?? false,
				breakEven: h?.breakEven ?? null,
				missing: h?.missing ?? []
			};
		}),
		comparison: compareHouseholds(
			columns.map((c) => ({ id: c.sheet.id, page: c.page })),
			highlights,
			{ stale }
		),
		read: !!snapshot,
		computedAt: snapshot?.computedAt ?? null,
		stale
	};
};
