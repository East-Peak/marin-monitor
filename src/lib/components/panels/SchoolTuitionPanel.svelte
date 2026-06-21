<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchSchoolTuitionDataWithStatus } from '$lib/api/marin/school-tuition';
	import { schoolTuitionStore } from '$lib/stores/school-tuition';
	import { LEVEL_ORDER, LEVEL_LABELS } from '$lib/config/schools';
	import type { SchoolIndexData, School, SchoolLevel } from '$lib/types/school';

	let data = $state<SchoolIndexData>({ current: null, history: [] });
	let dataLoading = $state(false);
	let dataError = $state<string | null>(null);

	const current = $derived(data.current);

	// Sort schools by level order, then by tuition descending within each level
	const sortedSchools = $derived.by<School[]>(() => {
		if (!current?.schools) return [];
		return [...current.schools].sort((a, b) => {
			const levelDiff = LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
			if (levelDiff !== 0) return levelDiff;
			return b.tuition - a.tuition;
		});
	});

	// Group schools by level for display
	const schoolsByLevel = $derived.by<Map<SchoolLevel, School[]>>(() => {
		const map = new Map<SchoolLevel, School[]>();
		for (const school of sortedSchools) {
			const list = map.get(school.level) ?? [];
			list.push(school);
			map.set(school.level, list);
		}
		return map;
	});

	function formatCurrency(amount: number): string {
		return '$' + amount.toLocaleString('en-US');
	}

	onMount(() => {
		void (async () => {
			dataLoading = true;
			dataError = null;
			try {
				const result = await fetchSchoolTuitionDataWithStatus();
				if (result.ok) {
					data = result.data;
					schoolTuitionStore.set(result.data);
				} else {
					dataError = `Live data unavailable (${result.error})`;
				}
			} finally {
				dataLoading = false;
			}
		})();
	});
</script>

<Panel
	id="school-tuition"
	title="Private School Tuition Index"
	loading={dataLoading}
	error={dataError}
>
	{#if current}
		<!-- Tier averages -->
		<div class="tiers-grid">
			{#each current.tiers as tier}
				<div class="tier-card">
					<div class="tier-label">{tier.label}</div>
					<div class="tier-price">{formatCurrency(tier.avgTuition)}</div>
					<div class="tier-pct">{tier.pctOfMedianIncome}% of median household income</div>
				</div>
			{/each}
		</div>

		<!-- Cumulative K-12 kicker -->
		<div class="kicker">
			<span class="kicker-label">Cumulative K-12 (13 years)</span>
			<span class="kicker-value">{formatCurrency(current.cumulativeK12)}</span>
		</div>

		<!-- Individual schools drill-down -->
		{#each LEVEL_ORDER as level}
			{@const schools = schoolsByLevel.get(level)}
			{#if schools && schools.length > 0}
				<div class="school-section">
					<div class="section-label">{LEVEL_LABELS[level]}</div>
					{#each schools as school}
						<div class="school-row">
							<div class="school-info">
								<a href={school.url} target="_blank" rel="noopener noreferrer" class="school-name">
									{school.name}
								</a>
								<span class="school-town">{school.town}</span>
							</div>
							<div class="school-price-col">
								<span class="school-price">{formatCurrency(school.tuition)}</span>
								{#if school.boardingTuition}
									<span class="school-boarding"
										>{formatCurrency(school.boardingTuition)} boarding</span
									>
								{/if}
								{#if school.totalCost}
									<span class="school-total">{formatCurrency(school.totalCost)} total</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/each}

		<!-- Attribution -->
		<div class="attribution">
			Median Marin County household income: {formatCurrency(current.medianHouseholdIncome)} ({current.incomeSource},
			{current.incomeYear})
		</div>
	{:else if dataLoading}
		<div class="empty-state">Loading school tuition data...</div>
	{:else}
		<div class="empty-state">School tuition data will appear after the first sync cycle.</div>
	{/if}
</Panel>

<style>
	.tiers-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.tier-card {
		padding: 0.55rem 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.tier-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-bottom: 0.2rem;
	}

	.tier-price {
		font-size: 1.1rem;
		font-weight: 700;
		color: #0891b2;
		letter-spacing: 0.01em;
	}

	.tier-pct {
		font-size: 0.48rem;
		color: var(--text-dim);
		margin-top: 0.12rem;
	}

	.kicker {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.55rem 0.6rem;
		margin-bottom: 0.75rem;
		background: rgba(8, 145, 178, 0.08);
		border: 1px solid rgba(8, 145, 178, 0.15);
		border-radius: 4px;
	}

	.kicker-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.kicker-value {
		font-size: 1rem;
		font-weight: 700;
		color: #0891b2;
	}

	.school-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--border);
	}

	.section-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-bottom: 0.3rem;
	}

	.school-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.3rem 0;
	}

	.school-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.school-name {
		font-size: 0.6rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-decoration: none;
		transition: color 0.15s;
	}

	.school-name:hover {
		color: #0891b2;
	}

	.school-town {
		font-size: 0.48rem;
		color: var(--text-dim);
	}

	.school-price-col {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		margin-left: 0.5rem;
		white-space: nowrap;
	}

	.school-price {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--text);
	}

	.school-boarding,
	.school-total {
		font-size: 0.45rem;
		color: var(--text-dim);
	}

	.attribution {
		text-align: center;
		font-size: 0.45rem;
		color: var(--text-dim);
		padding-top: 0.3rem;
		line-height: 1.4;
	}

	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 0.7rem;
		padding: 1rem;
	}

	@media (max-width: 1100px) {
		.tiers-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
