<!-- The Cost section's Lifestyle Index card (LIFE2): one fictional household's break-even, picked by town. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Measured } from '$lib/dashboard/measured';
	import { dailySlug, FICTION_LABEL, type LifestyleCard } from '$lib/lifestyle/view';
	import ClassChips from '../lifestyle/ClassChips.svelte';
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
	/** The household's first highlight with a figure (LIFE3): desktop only, beside the biggest lines. */
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
				{#if h.complete && h.breakEven !== null}
					<div class="hero-row">
						<span class="num" data-break-even data-text-role="headline"
							>{usd(h.breakEven)}<span class="per" data-text-role="meta">/yr</span></span
						>
						<span class="meta" data-text-role="meta">pre-tax, to break even</span>
					</div>
					<p class="sub" data-text-role="label">
						{h.name}: {usd(h.burnMonthly)} a month going out, before saving anything.
						<a class="more hit-44" href="/cost/{h.slug}">The whole budget →</a>
					</p>
				{:else}
					<div class="hero-row">
						<span class="num" data-burn data-text-role="value"
							>{usd(h.burnMonthly)}<span class="per">/mo so far</span></span
						>
						<span class="incomplete" data-incomplete data-text-role="meta">incomplete</span>
					</div>
					<p class="sub" data-text-role="label">
						{h.name}: no break-even while {list(h.missing)} can’t be read.
						<a class="more hit-44" href="/cost/{h.slug}">The whole budget →</a>
					</p>
				{/if}
				<SectionStack sections={h.sections} key={4} />
			</div>
			<div class="half">
				<ul class="top">
					{#each h.top as l (l.id)}
						<li data-line={l.id}>
							<span class="lab" data-text-role="label" title={l.label}
								><span class="t">{l.label}</span><ClassChips
									classes={l.classes}
								/>{#if l.availability === 'stale'}<span class="stale" data-stale>stale</span
									>{/if}</span
							>
							<span class="num" data-text-role="label">{usd(l.monthly)}</span>
						</li>
					{/each}
				</ul>
				{#if highlight}
					<p class="hl" data-card-highlight data-highlight={highlight.key} data-text-role="label">
						<span class="num">{highlight.figure}</span>
						{highlight.text}{#if highlight.modelled}
							<span class="modelled" data-modelled data-text-role="meta">modelled</span>{/if}
					</p>
				{/if}
			</div>
		</div>
	{:else}
		<p class="empty" data-text-role="body">{why(view)}</p>
	{/if}
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
</article>

<style>
	/* The approved LIFE0 mockup's card (lifestyle-mockup.html), in the dashboard's own tokens. */
	.card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
		padding: 12px 14px;
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
	.more:focus-visible {
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
	.body,
	.half {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	/* Full section width on desktop: the numbers beside the biggest lines. */
	@media (min-width: 1024px) {
		.body {
			flex-direction: row;
			gap: 28px;
		}
		.half {
			flex: 1 1 0;
		}
	}
	.hero-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 10px;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.per,
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
	.top {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.top li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
		padding: 4px 0;
		border-bottom: 1px solid var(--border);
	}
	.top li:last-child {
		border-bottom: 0;
	}
	/* One row a line: a long label truncates (its full text is the title), its chips stay. */
	.lab {
		display: flex;
		align-items: baseline;
		min-width: 0;
	}
	.lab .t {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lab :global(.chips) {
		flex: none;
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
	/* Below the two-column card there is no room for it: the phone's height budget (§13.3) holds. */
	@media (max-width: 1023px) {
		.hl {
			display: none;
		}
	}
	/* The phone's height budget (§13.3) pays for the headline break-even. */
	@media (max-width: 767px) {
		.card,
		.body,
		.half {
			gap: 6px;
		}
		.top li {
			padding: 3px 0;
		}
	}
	.stale {
		margin-left: 6px;
		color: var(--amber, #f59e0b);
	}
	.more {
		white-space: nowrap;
		color: var(--accent);
		text-decoration: none;
	}
</style>
