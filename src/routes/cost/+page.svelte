<!-- /cost: the fictional households side by side on one shared dollar scale (COSTX1). -->
<script lang="ts">
	import '$lib/components/dashboard-v2/v2-tokens.css';
	import ClassChips from '$lib/components/lifestyle/ClassChips.svelte';
	import { PACIFIC } from '$lib/dashboard/pacific-time';
	import type { CompareCell } from '$lib/lifestyle/compare';
	import { FICTION_LABEL, lineAnchor, SECTION_COLOR } from '$lib/lifestyle/view';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const households = $derived(data.households);
	const rows = $derived(data.comparison.rows);
	const zero = $derived(data.comparison.zeroPct);
	const anyPartial = $derived(rows.some((r) => r.cells.some((c) => c.state === 'partial')));

	/** A signed amount: a net-income section reads below zero, never as spending. */
	const usd = (n: number) =>
		`${n < 0 ? '−' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
	const day = (iso: string) =>
		new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: PACIFIC
		});
	const list = (xs: readonly string[]) =>
		xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
	/** What a cell says: its amount in SectionShare's terms, never $0 for unknown. */
	function amount(c: CompareCell): string {
		switch (c.state) {
			case 'value':
			case 'zero':
				return usd(c.monthly!);
			case 'partial':
				return `${usd(c.monthly!)} so far`;
			case 'unknown':
			case 'unread':
				return 'can’t be read';
			case 'absent':
				return 'no line';
		}
	}
	const townOf = (id: string) => households.find((h) => h.id === id)!;
</script>

<svelte:head>
	<title>Cost · What it takes to live here · Marin Monitor</title>
</svelte:head>

<div class="dash-v2 cost-page" data-layout="cost-compare">
	<main class="wrap">
		<nav class="crumb" aria-label="Breadcrumb" data-text-role="meta">
			<a class="hit-44" href="/">Marin Monitor</a> › Cost
			<span class="towns">
				{#each households as h (h.slug)}
					<a class="hit-44" href="/cost/{h.slug}">{h.town}</a>
				{/each}
			</span>
		</nav>

		{#if data.read && data.stale}
			<p class="flag" data-stale-budget data-text-role="body">
				No weekly run has priced every household on in-date reads in ten days{data.computedAt
					? ` (last run ${day(data.computedAt)})`
					: ''}: some of these reads may be out of date.
			</p>
		{/if}

		<header class="intro">
			<span class="fiction" data-fiction data-text-role="meta">{FICTION_LABEL}</span>
			<h1 data-text-role="section-title">What it takes to live here, side by side</h1>
		</header>

		{#if data.read}
			<ul class="households" aria-label="The households">
				{#each households as h (h.id)}
					<li class="household" data-household={h.slug}>
						<a class="town hit-44" href="/cost/{h.slug}" data-town-link data-text-role="label"
							>{h.town} →</a
						>
						<h2 data-text-role="label">The {h.name}</h2>
						<p class="who" data-text-role="meta">{h.who}</p>
						{#if h.read && h.burnMonthly !== null}
							<p class="burn num" data-burn data-text-role="value">
								{usd(h.burnMonthly)}<span class="per" data-text-role="meta"
									>a month{h.soFar ? ' so far' : ''}</span
								>
							</p>
							{#if h.breakEven !== null}
								<p class="meta" data-break-even data-text-role="meta">
									<span class="num">{usd(h.breakEven)}</span> a year, pre-tax, to break even
								</p>
							{:else}
								<p class="meta" data-text-role="meta">
									<span class="flag" data-incomplete>incomplete</span> · no break-even while {list(
										h.missing
									)} can’t be read
								</p>
							{/if}
						{:else}
							<p class="flag" data-unavailable data-text-role="meta">
								This household’s budget can’t be read right now.
							</p>
						{/if}
					</li>
				{/each}
			</ul>

			<section class="compare" aria-labelledby="compare-title">
				<div class="compare-head">
					<h2 id="compare-title" data-text-role="section-title">A month, by section</h2>
					<p class="meta" data-text-role="meta">
						Every bar on one scale, from $0. Open a section for each household’s own lines.
					</p>
					{#if anyPartial}
						<p class="meta key" data-partial-key data-text-role="meta">
							<i class="swatch-partial" aria-hidden="true"></i> so far: some of the section’s lines can’t
							be read, so it is not compared
						</p>
					{/if}
				</div>
				{#each rows as r (r.section)}
					<details class="row" data-compare-section={r.section} data-comparable={r.comparable}>
						<summary>
							<span class="name" data-text-role="label"
								><i class="sw" style:background={SECTION_COLOR[r.section]}></i>{r.section}</span
							>
							<span class="cells">
								{#each r.cells as c (c.id)}
									<span class="cell" data-cell={townOf(c.id).slug} data-cell-state={c.state}>
										<span class="cell-town" data-text-role="meta">{townOf(c.id).town}</span>
										<span class="track" aria-hidden="true">
											{#if zero > 0}<i class="zero" style:left="{zero}%"></i>{/if}
											{#if c.bar}
												<i
													class="bar"
													class:partial={c.state === 'partial'}
													data-bar
													style:left="{c.bar.from}%"
													style:width="{c.bar.to - c.bar.from}%"
													style:--c={SECTION_COLOR[r.section]}
												></i>
											{/if}
										</span>
										<span class="amt num" data-amount data-text-role="label"
											><span class:flag={c.state === 'unknown' || c.state === 'unread'}
												>{amount(c)}</span
											>{#if c.stale}<span class="flag" data-cell-stale>{' · stale'}</span
												>{/if}</span
										>
									</span>
								{/each}
							</span>
							{#if r.highlight}
								<span class="hl" data-comparison-highlight data-text-role="meta"
									><span class="hl-k">Comparison highlight</span>
									{r.highlight.text}</span
								>
							{/if}
						</summary>
						<div class="lines" data-lines>
							{#each r.cells as c (c.id)}
								{@const h = townOf(c.id)}
								<section class="col" data-lines-for={h.slug} aria-label="{h.town}, {r.section}">
									<h3 data-text-role="label">{h.town}</h3>
									{#if c.lines.length}
										<ul>
											{#each c.lines as l (l.id)}
												<li>
													<a
														class="line hit-row"
														href="/cost/{h.slug}#{lineAnchor(l.id)}"
														data-line={l.id}
														data-availability={l.availability}
														data-text-role="label"
													>
														<span class="lab"
															>{l.label}{#if l.availability !== 'ok'}<span
																	class="flag"
																	data-text-role="meta"
																	>{l.availability === 'stale' ? ' stale' : ' can’t be read'}</span
																>{/if}</span
														>
														<ClassChips classes={l.classes} quiet />
														<span class="num">{l.monthly === null ? '—' : usd(l.monthly)}</span>
													</a>
												</li>
											{/each}
										</ul>
									{:else}
										<p class="meta" data-text-role="meta">{amount(c)}</p>
									{/if}
								</section>
							{/each}
							<p class="legend" data-provenance-legend data-text-role="meta">
								<span><ClassChips classes={['live']} quiet /> live: our own read</span>
								<span><ClassChips classes={['cited']} quiet /> cited: a published figure</span>
								<span><ClassChips classes={['persona']} quiet /> persona: an assumption</span>
							</p>
						</div>
					</details>
				{/each}
			</section>
		{:else}
			<p data-text-role="body" data-unavailable>The households’ budgets can’t be read right now.</p>
		{/if}
	</main>
</div>

<style>
	.cost-page {
		min-height: 100vh;
		background: var(--bg);
		color: var(--text-primary);
		padding: 20px max(16px, env(safe-area-inset-right, 0px)) 48px
			max(16px, env(safe-area-inset-left, 0px));
	}
	.wrap {
		max-width: 1080px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.meta,
	.crumb {
		margin: 0;
		color: var(--text-muted);
		font-weight: 400;
	}
	a {
		color: var(--accent);
		text-decoration: none;
	}
	a:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	h1,
	h2,
	h3,
	p {
		margin: 0;
	}
	.towns {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		margin-left: 12px;
	}
	.flag,
	.fiction {
		color: var(--amber, #f59e0b);
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: var(--v2-s1);
	}
	.fiction {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.fiction::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}

	/* The households: the town page's header, three across. */
	.households {
		display: grid;
		gap: var(--v2-s3);
		grid-template-columns: minmax(0, 1fr);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	@media (min-width: 640px) {
		.households {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	.household {
		display: flex;
		flex-direction: column;
		gap: var(--v2-s1);
		min-width: 0;
		padding: var(--v2-s3) 14px;
		border: 1px solid var(--border-light);
		border-radius: 8px;
	}
	.household h2 {
		color: var(--text-secondary);
		font-weight: 500;
	}
	.town {
		align-self: flex-start;
		font-weight: 500;
	}
	.who {
		color: var(--text-muted);
	}
	.burn {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 6px;
		margin-top: var(--v2-s2);
	}
	.per {
		color: var(--text-muted);
		font-weight: 400;
	}
	.household [data-break-even] .num {
		color: var(--text-secondary);
	}

	/* The comparison: a row per section, a bar per household, one scale for every bar. */
	.compare {
		display: flex;
		flex-direction: column;
	}
	.compare-head {
		display: flex;
		flex-direction: column;
		gap: var(--v2-s1);
		padding-bottom: var(--v2-s3);
	}
	.compare-head h2 {
		font-weight: 500;
	}
	.key {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.swatch-partial {
		flex: none;
		width: 18px;
		height: 8px;
		border-radius: 2px;
		box-shadow: inset 0 0 0 1px var(--text-muted);
		background: repeating-linear-gradient(135deg, var(--text-muted) 0 2px, transparent 2px 5px);
	}
	.row {
		border-top: 1px solid var(--border-light);
	}
	summary {
		display: grid;
		grid-template-columns: 9.5rem minmax(0, 1fr);
		gap: var(--v2-s1) var(--v2-s4);
		align-items: start;
		padding: var(--v2-s3) 0;
		list-style: none;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover .name {
		color: var(--text-primary);
	}
	.name {
		display: flex;
		align-items: center;
		gap: var(--v2-s2);
		color: var(--text-secondary);
		font-weight: 500;
		text-transform: capitalize;
	}
	.name::after {
		content: '▸';
		margin-left: auto;
		color: var(--text-muted);
		transition: transform 0.15s;
	}
	details[open] .name::after {
		transform: rotate(90deg);
	}
	.sw {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}
	.cells {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.cell {
		display: grid;
		grid-template-columns: 6.5rem minmax(0, 1fr) 7.5rem;
		gap: var(--v2-s3);
		align-items: center;
	}
	.cell-town {
		color: var(--text-muted);
		white-space: nowrap;
	}
	.track {
		position: relative;
		height: 10px;
		border-radius: 2px;
		background: rgba(148, 163, 184, 0.08);
	}
	.zero {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 1px;
		background: var(--text-muted);
	}
	.bar {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 2px;
		background: var(--c);
	}
	/* "So far": an outline, hatched, never the solid of a whole section. */
	.bar.partial {
		background: repeating-linear-gradient(135deg, var(--c) 0 2px, transparent 2px 5px);
		box-shadow: inset 0 0 0 1px var(--c);
	}
	.amt {
		text-align: right;
		color: var(--text-primary);
		white-space: nowrap;
	}
	.hl {
		grid-column: 2;
		color: var(--text-secondary);
		max-width: 72ch;
	}
	.hl-k {
		color: var(--text-muted);
		margin-right: 4px;
	}
	.hl-k::after {
		content: ':';
	}

	/* A section opened: each household's own lines, under its own name (R1). */
	.lines {
		display: grid;
		gap: var(--v2-s3) var(--v2-s5);
		grid-template-columns: repeat(3, minmax(0, 1fr));
		padding: 0 0 var(--v2-s4) calc(9.5rem + var(--v2-s4));
	}
	.col {
		min-width: 0;
	}
	.col h3 {
		padding-bottom: var(--v2-s1);
		border-bottom: 1px solid var(--border);
		color: var(--text-muted);
		font-weight: 500;
	}
	.col ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.col li {
		border-bottom: 1px solid var(--border);
	}
	.line {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 2.5rem auto;
		gap: var(--v2-s2);
		align-items: baseline;
		padding: var(--v2-s1) 0;
		color: var(--text-secondary);
	}
	.line:hover .lab {
		color: var(--text-primary);
	}
	.line .num {
		color: var(--text-primary);
		min-width: 4.5rem;
		text-align: right;
	}
	.lab {
		min-width: 0;
	}
	.legend {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 2px 16px;
		color: var(--text-muted);
	}
	.legend span {
		display: inline-flex;
		align-items: baseline;
		gap: 4px;
	}

	/* Under 640 px each section stacks its households, each row labelled (R11). */
	@media (max-width: 639px) {
		summary {
			grid-template-columns: minmax(0, 1fr);
		}
		.cell {
			/* A fixed amount column: every track the same width, so every bar the same scale. */
			grid-template-columns: 5.25rem minmax(0, 1fr) 6.75rem;
			gap: var(--v2-s2);
		}
		.hl {
			grid-column: 1;
		}
		.lines {
			grid-template-columns: minmax(0, 1fr);
			padding-left: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.name::after {
			transition: none;
		}
	}
	/* Touch: a section's row and each line are full 44 px targets (MOBILE1). */
	@media (pointer: coarse) {
		summary {
			min-height: 44px;
		}
		.line {
			min-height: 44px;
			align-items: center;
		}
	}
</style>
