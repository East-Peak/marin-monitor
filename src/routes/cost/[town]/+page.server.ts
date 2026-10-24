/**
 * /cost/<town>: one fictional household's whole modelled budget (LIFE2).
 * A 404 while the Lifestyle Index's flag is off, and for a town with no sheet.
 */
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { COST_DATASETS } from '$lib/dashboard/cost';
import { SHEETS } from '$lib/lifestyle/sheets';
import { householdPage, sheetForSlug, townSlug } from '$lib/lifestyle/view';
import {
	highlightsOn,
	lifestyleBlobApi,
	lifestyleHighlights,
	lifestyleOn,
	readLifestyleDoc
} from '$lib/server/lifestyle/read';
import type { PageServerLoad } from './$types';

const READ_MS = 8000;
/** /api/health's own max age for the Lifestyle Index: past it, the whole budget may be out of date. */
const MAX_AGE_MS = COST_DATASETS.lifestyle.maxAgeDays * 86_400_000;

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	if (!lifestyleOn(env)) error(404, 'Not found');
	const sheet = sheetForSlug(SHEETS, params.town);
	if (!sheet) error(404, 'Not found');

	const api = lifestyleBlobApi(env);
	const read = api ? await readLifestyleDoc(api, AbortSignal.timeout(READ_MS)) : null;
	const snapshot = read?.current ?? null;
	const budget = snapshot?.budgets.find((b) => b.town === sheet.id) ?? null;
	// A failed read is never edge-cached as the household's page.
	setHeaders({
		'Cache-Control': budget
			? 'public, s-maxage=600, stale-while-revalidate=3600'
			: 'private, no-store'
	});
	return {
		town: sheet.town,
		page: budget ? householdPage(budget, sheet) : null,
		// Null while the highlights' own flag is off.
		highlights:
			read && budget && highlightsOn(env)
				? (lifestyleHighlights(read, SHEETS)[sheet.id] ?? [])
				: null,
		computedAt: snapshot?.computedAt ?? null,
		// A stopped run leaves each line's availability as it was: say so for the whole budget.
		stale:
			!!snapshot && !(Date.now() - Date.parse(snapshot.lastSuccessfulScrapeAt ?? '') <= MAX_AGE_MS),
		towns: SHEETS.map((s) => ({ slug: townSlug(s.town), town: s.town }))
	};
};
