/** Each map dataset's G0a policy (SOURCE_INVENTORY; a test pins them equal). */
export const DATASET_POLICY = {
	gas: { healthName: 'Gas Prices', maxAgeDays: 2 },
	ev: { healthName: 'EV Charging', maxAgeDays: 2 },
	coffee: { healthName: 'Marin Coffee Index', maxAgeDays: 10 },
	fitness: { healthName: 'Fitness', maxAgeDays: 45 }
} as const;
