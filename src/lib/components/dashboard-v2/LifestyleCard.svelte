<!-- The Cost section's Lifestyle Index card (LIFE2, COST1): one fictional household's month and receipt, picked by town. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Measured } from '$lib/dashboard/measured';
	import {
		dailySlug,
		FICTION_LABEL,
		lineTally,
		pricedSoFar,
		type LifestyleCard
	} from '$lib/lifestyle/view';
	import ReceiptRow from '../lifestyle/ReceiptRow.svelte';
	import SectionStack from '../lifestyle/SectionStack.svelte';
	import CardSource from './CardSource.svelte';

	let { view, now, onopen }: { view: Measured<LifestyleCard>; now: number; onopen?: () => void } =
		$props();

	// The phone mounts this body only while the section is open: mounting is opening (§7).
	onMount(() => onopen?.());

	const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
	const list = (xs: readonly string[]) =>
		xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

	let picked = $state<string | null>(null);
	const households = $derived(view.kind === 'value' ? view.value.households : []);
	/** The visitor's pick, else the household of the day. */
	const slug = $derived(
		picked && households.some((h) => h.slug === picked)
			? picked
			: households.length
				? dailySlug(
						households.map((h) => h.slug),
						now
					)
				: null
	);
	const h = $derived(households.find((x) => x.slug === slug) ?? null);
	const soFar = $derived(!!h && pricedSoFar(h));
	/** The household's first highlight with a figure (LIFE3). */
	const highlight = $derived(h?.highlights?.find((x) => x.figure !== null) ?? null);
	const notes = $derived(
		h
			? [
					`${h.inputs.live} live · ${h.inputs.cited} cited · ${h.inputs.persona} persona inputs · ${Math.round(h.personaOnly * 100)}% persona-only`,
					...(h.stale ? [`${h.stale} ${h.stale === 1 ? 'line reads' : 'lines read'} stale`] : [])
				]
			: []
	);
	const why = (m: Measured<unknown>) =>
		m.kind === 'loading'
			? 'Loading…'
			: m.kind === 'value'
				? 'No household could be read.'
				: `${m.kind === 'unknown' ? 'Unknown' : 'Unavailable'} · ${m.reason}`;
</script>

<article class="card" data-card="lifestyle" data-household={h?.slug}>
	<div class="card-head">
		<h3 class="card-title" data-text-role="label">What it takes to live here</h3>
		{#if households.length > 1}
			<div class="picker" role="group" aria-label="Household">
				{#each households as x (x.slug)}
					<button
						type="button"
						class="hit-44"
						data-town={x.slug}
						data-text-role="label"
						aria-pressed={x.slug === slug}
						onclick={() => (picked = x.slug)}>{x.town}</button
					>
				{/each}
			</div>
		{/if}
	</div>
	<span class="fiction" data-fiction data-text-role="meta">{FICTION_LABEL}</span>
	{#if h}
		<div class="body">
			<div class="half">
				<a class="hero hit-44" href="/cost/{h.slug}" data-burn data-text-role="headline"
					><span class="num">{usd(h.burnMonthly)} a month{soFar ? ' so far' : ''}</span></a
				>
				{#if h.complete}
					<p class="sub" data-text-role="label">{h.name}: going out, before saving anything</p>
				{:else}
					<p class="sub" data-text-role="label">
						<span class="incomplete" data-incomplete>incomplete</span>
						· {h.name}: no break-even while {list(h.missing)} can’t be read
					</p>
				{/if}
				{#if h.breakEven !== null}
					<p class="meta" data-break-even data-text-role="meta">
						To break even: {usd(h.breakEven)} a year before tax
					</p>
				{/if}
				<div class="bar"><SectionStack sections={h.sections} key={4} /></div>
			</div>
			<div class="half receipt-side">
				<ul class="receipt">
					{#each h.receipt as l (l.id)}
						<li><ReceiptRow line={l} slug={h.slug} /></li>
					{/each}
				</ul>
				<div class="total" data-receipt-total data-text-role="label">
					<span>{lineTally(h)}</span><span class="num"
						>{usd(h.burnMonthly)} a month{soFar ? ' so far' : ''}</span
					>
				</div>
			</div>
			{#if highlight}
				<p class="hl" data-card-highlight data-highlight={highlight.key} data-text-role="label">
					<span class="num">{highlight.figure}</span>
					{highlight.text}{#if highlight.modelled}
						<span class="modelled" data-modelled data-text-role="meta">modelled</span>{/if}
				</p>
			{/if}
		</div>
	{:else}
		<p class="empty" data-text-role="body">{why(view)}</p>
	{/if}
	<div class="foot">
		<!-- Its time is the last run that priced every household on in-date reads: none yet is never green. -->
		<CardSource
			lines={[
				{
					measured: view,
					verb: 'priced',
					untimed: 'no complete run on in-date reads yet',
					muted: view.kind === 'value' && view.observedAt === null
				}
			]}
			{now}
			{notes}
		/>
		{#if h}
			<a class="see-all" href="/cost/{h.slug}" data-see-all data-text-role="label"
				>See all {h.lineCount} lines →</a
			>
		{/if}
	</div>
</article>

<style>
	/* The approved LIFE0 mockup's card (lifestyle-mockup.html), in the dashboard's own tokens. */
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--v2-s3);
		min-width: 0;
		padding: var(--v2-s3) 14px;
		border: 1px solid var(--border-light);
		border-radius: 8px;
	}
	.card-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
	}
	.card-title {
		margin: 0;
		color: var(--text-muted);
		font-weight: 400;
	}
	.picker {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.picker button {
		font: inherit;
		color: var(--text-secondary);
		background: transparent;
		border: 1px solid var(--border-light);
		border-radius: 999px;
		padding: 3px 10px;
		cursor: pointer;
	}
	.picker button[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
		font-weight: 500;
	}
	.picker button:focus-visible,
	.hero:focus-visible,
	.see-all:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.fiction,
	.incomplete {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--amber, #f59e0b);
	}
	.fiction::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}
	.incomplete {
		font-weight: 600;
	}
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--v2-s3);
		min-width: 0;
	}
	.half {
		display: flex;
		flex-direction: column;
		gap: var(--v2-s2);
		min-width: 0;
	}
	/* Full section width on desktop: the month beside the receipt, the highlight under the month. */
	@media (min-width: 1024px) {
		.body {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			grid-template-rows: auto 1fr;
			column-gap: 28px;
		}
		.receipt-side {
			grid-column: 2;
			grid-row: 1 / span 2;
		}
	}
	.hero {
		width: fit-content;
		color: var(--text-primary);
		text-decoration: none;
	}
	.hero:hover {
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 4px;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.meta,
	.empty {
		margin: 0;
		color: var(--text-muted);
		font-weight: 400;
	}
	.sub {
		margin: 0;
		color: var(--text-secondary);
	}
	.receipt {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.receipt li {
		border-bottom: 1px solid var(--border);
	}
	.receipt li:last-child {
		border-bottom: 0;
	}
	.total {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0 var(--v2-s3);
		padding-top: var(--v2-s2);
		border-top: 2px solid var(--border-light);
		color: var(--text-secondary);
	}
	.hl {
		margin: 0;
		color: var(--text-secondary);
	}
	.hl .num {
		font-weight: 600;
		color: var(--text-primary);
		margin-right: 4px;
	}
	.modelled {
		margin-left: 4px;
		color: var(--amber, #f59e0b);
	}
	.foot {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--v2-s4);
		min-width: 0;
	}
	.see-all {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0 var(--v2-s4);
		border: 1px solid var(--accent);
		border-radius: 8px;
		color: var(--accent);
		font-weight: 500;
		text-align: center;
		text-decoration: none;
	}
	.see-all:hover {
		background: var(--surface-hover, transparent);
	}
	/* The phone: the receipt says what the money is for, so the bar goes (Stuart, COST0), and
	   the way in takes the card's full width. */
	@media (max-width: 767px) {
		.card,
		.body {
			gap: var(--v2-s2);
		}
		.bar {
			display: none;
		}
		.foot {
			flex-direction: column;
			align-items: stretch;
			gap: var(--v2-s2);
		}
	}
</style>
