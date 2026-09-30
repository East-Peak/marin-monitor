/**
 * The source-health indicator's labels, in one dependency-free module: the
 * summary builds them, and the unit test and the production spec check them.
 */
export const HEALTH_LABELS = {
	checking: 'Checking sources…',
	unknown: 'Source health unknown',
	staleReport: 'Source health may be out of date',
	allOk: 'Sources: all OK',
	degradedUnlisted: 'Sources: degraded',
	degraded: (n: number) => `Sources: ${n} degraded`
} as const;

/** Every label except "checking": what a settled indicator may show. */
export const SETTLED_HEALTH_LABEL =
	/^(Sources: (all OK|degraded|\d+ degraded)|Source health (unknown|may be out of date))$/;
