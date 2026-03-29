// src/lib/server/scrapers/school-tuition.ts

import {
	SCHOOLS,
	MEDIAN_HOUSEHOLD_INCOME,
	INCOME_SOURCE,
	INCOME_YEAR,
	computeTiers,
	computeCumulativeK12
} from '$lib/config/schools';
import type { School, SchoolSnapshot } from '$lib/types/school';

/**
 * Convert a SchoolConfig to a School (runtime type).
 */
function toSchool(config: (typeof SCHOOLS)[number]): School {
	return {
		id: config.id,
		name: config.name,
		town: config.town,
		level: config.level,
		tuition: config.tuition,
		boardingTuition: config.boardingTuition,
		totalCost: config.totalCost,
		url: config.url,
		lat: config.lat,
		lon: config.lon
	};
}

/**
 * Compute a SchoolSnapshot from the hardcoded config values.
 * For v1 this does not perform any live scraping -- the tuition
 * values are maintained in the config file and updated manually
 * once per year. A future version could scrape school websites
 * to verify/update the values.
 */
export function computeSchoolSnapshot(): SchoolSnapshot {
	const tiers = computeTiers(SCHOOLS, MEDIAN_HOUSEHOLD_INCOME);
	const cumulativeK12 = computeCumulativeK12(tiers);
	const schools = SCHOOLS.map(toSchool);

	return {
		timestamp: new Date().toISOString(),
		medianHouseholdIncome: MEDIAN_HOUSEHOLD_INCOME,
		incomeSource: INCOME_SOURCE,
		incomeYear: INCOME_YEAR,
		tiers,
		schools,
		cumulativeK12
	};
}
