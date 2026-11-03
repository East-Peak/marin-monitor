#!/usr/bin/env node
/**
 * The Range Rover Sport P360 SE lease offer, Ross's car (COSTDATA-1). Every
 * part comes from the one offer on Land Rover's own page, checked against its
 * disclosure: monthly, due at signing (the sum of its parts), term, trim,
 * region and the date it ends. The offer is written as read, ended or not:
 * its end rides along and is enforced wherever it is priced, so an ended
 * offer reads unavailable rather than as last month's price.
 */
import { RANGE_ROVER_URL, parseRangeRoverOffer } from './shared/published-prices.mjs';
import { get, run, writePublished } from './shared/published-sync.mjs';

const BLOB_KEY = 'marin-range-rover-lease.json';

run('sync-range-rover-lease', async () => {
	const response = await get(RANGE_ROVER_URL);
	if (!response.ok) throw new Error(`${RANGE_ROVER_URL} returned ${response.status}`);
	const offer = parseRangeRoverOffer(await response.text());
	const end = new Date(`${offer.validUntil}T00:00:00Z`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
	return writePublished(BLOB_KEY, {
		url: RANGE_ROVER_URL,
		period: `offer, deliveries by ${end}`,
		validUntil: offer.validUntil,
		trim: offer.trim,
		months: offer.months,
		region: offer.region,
		values: { 'rangeRover.lease': offer.monthly, 'rangeRover.dueAtSigning': offer.dueAtSigning }
	});
});
