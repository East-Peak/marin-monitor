<!-- /cost/<town>: one fictional household's modelled budget (LIFE2; the approved LIFE0 mockup). -->
<script lang="ts">
	import '$lib/components/dashboard-v2/v2-tokens.css';
	import ClassChips from '$lib/components/lifestyle/ClassChips.svelte';
	import { PACIFIC } from '$lib/dashboard/pacific-time';
	import type { PricedInput } from '$lib/lifestyle/model';
	import { FICTION_LABEL, formatInput, SECTION_COLOR, sourceLink } from '$lib/lifestyle/view';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const p = $derived(data.page);
	const h = $derived(p?.summary ?? null);
	/** Today's town median: context only, with its own provenance. */
	const t = $derived(p?.marketTracker ?? null);
	const trackerLink = $derived(t?.source ? sourceLink(t.source) : null);

	const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
	const money = (n: number | null) => (n === null ? '—' : usd(n));
	const pct = (share: number) => (share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);
	const day = (iso: string) =>
		new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: PACIFIC
		});
	/** Live: when the source saw it. Cited: when we checked the publication. */
	const when = (i: PricedInput) =>
		i.asOf === null ? null : `${i.class === 'live' ? 'read' : 'checked'} ${day(i.asOf)}`;
</script>

<svelte:head>
	<title>{data.town} · What it takes to live here · Marin Monitor</title>
</svelte:head>

<div class="dash-v2 cost-page" data-layout="cost">
	<main class="wrap">
		<nav class="crumb" aria-label="Breadcrumb" data-text-role="meta">
			<a class="hit-44" href="/">Marin Monitor</a> › Cost › {data.town}
			<span class="towns">
				{#each data.towns as t (t.slug)}
					<a
						class="hit-44"
						href="/cost/{t.slug}"
						aria-current={t.town === data.town ? 'page' : undefined}>{t.town}</a
					>
				{/each}
			</span>
		</nav>

		{#if p && data.stale}
			<p class="flag" data-stale-budget data-text-role="body">
				No weekly run has priced every household on in-date reads in ten days{data.computedAt
					? ` (last run ${day(data.computedAt)})`
					: ''}: some of these reads may be out of date.
			</p>
		{/if}
		{#if p && h}
			<div class="head">
				<div class="who">
					<span class="fiction" data-fiction data-text-role="meta">{FICTION_LABEL}</span>
					<h1 data-text-role="section-title">The {h.name}</h1>
					<p data-text-role="body">{p.who}. Savings: {p.savingsNote}.</p>
					{#if t}
						<p class="meta tracker" data-market-tracker data-text-role="meta">
							<ClassChips classes={[t.class]} />
							<span>
								The {h.town} median, {money(t.value)} ({t.label}){#if trackerLink}, <a
										class="hit-44"
										href={trackerLink.href}
										rel="noopener noreferrer"
										target="_blank">{trackerLink.host}</a
									>{/if}{#if when(t)}, {when(t)}{/if}{#if t.availability !== 'ok'}<span class="flag"
										>, {t.availability}{t.reason ? `: ${t.reason}` : ''}</span
									>{/if}, is context only: it never reprices this household’s home.
							</span>
						</p>
					{/if}
				</div>
				<section class="equation" aria-label="Break-even income">
					<p class="meta" data-text-role="meta">
						A modelled lifestyle budget, worked back through {p.taxYear} federal and California tax
					</p>
					{#if p.equation}
						{@const e = p.equation}
						<p class="big num" data-break-even data-text-role="value">
							{usd(e.gross)}
							<span class="meta" data-text-role="meta">a year, pre-tax, to break even</span>
						</p>
						<div class="row" data-text-role="label">
							<span>Wages (W-2, split {e.split})</span><span class="num">{usd(e.gross)}</span>
						</div>
						{#each e.rows as r (r.label)}
							<div class="row" data-text-role="label">
								<span>{r.label}</span><span class="num">−{usd(r.amount)}</span>
							</div>
						{/each}
						<div class="row total" data-text-role="label">
							<span>= Take-home</span><span class="num">{usd(e.takeHome)}</span>
						</div>
						<div class="row" data-text-role="label">
							<span>Spending: the budget below</span><span class="num">{usd(e.spending)}</span>
						</div>
						{#if e.afterTaxSavings > 0}
							<div class="row" data-text-role="label">
								<span>Savings, after tax</span><span class="num">{usd(e.afterTaxSavings)}</span>
							</div>
						{/if}
					{:else}
						<p class="big num" data-burn data-text-role="value">
							{usd(h.burnMonthly)}<span class="meta" data-text-role="meta">/mo so far</span>
							<span class="incomplete" data-incomplete data-text-role="meta">incomplete</span>
						</p>
						<p data-text-role="body">
							No break-even while these can’t be read: {h.missing.join(', ')}.
						</p>
					{/if}
				</section>
			</div>

			{#if data.highlights?.length}
				<section class="scale" aria-label="For scale" data-highlights>
					<h2 data-text-role="label">For scale</h2>
					<ul>
						{#each data.highlights as x (x.key)}
							<li data-highlight={x.key} class:plain={x.figure === null}>
								{#if x.figure !== null}
									<span class="x num" data-figure data-text-role="value">{x.figure}</span>
								{/if}
								<span class="y" data-text-role="label">{x.text}</span>
								{#if x.modelled || x.sources.length}
									<span class="meta" data-text-role="meta"
										>{#if x.modelled}<span class="modelled" data-modelled>modelled</span
											>{/if}{#if x.sources.length}<span data-sources
												>{x.modelled ? ' · ' : ''}{x.sources.join(', ')}</span
											>{/if}</span
									>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="budget" aria-label="The budget">
				{#each p.sections as s (s.section)}
					<div class="sec" data-section={s.section}>
						<div class="sec-head">
							<h2 data-text-role="section-title">
								<i class="sw" style:background={SECTION_COLOR[s.section]}></i>{s.section}
							</h2>
							<span class="num" data-text-role="label"
								>{usd(s.monthly)} <span class="meta">/mo · {pct(s.share)}</span></span
							>
							<div class="bar">
								<i style:width="{s.widthPct}%" style:background={SECTION_COLOR[s.section]}></i>
							</div>
						</div>
						{#each s.lines as l (l.id)}
							<details data-line={l.id} data-availability={l.availability}>
								<summary data-text-role="label">
									<span class="lab"
										>{l.label}<ClassChips classes={l.classes} />{#if l.availability !== 'ok'}<span
												class="flag"
												data-text-role="meta">{l.availability}</span
											>{/if}</span
									>
									<span class="num">{money(l.monthly)}</span>
								</summary>
								<ul class="inputs">
									{#each l.inputs as i (i.name)}
										{@const link = i.source ? sourceLink(i.source) : null}
										<li
											class:hit-row={!!link}
											data-input={i.name}
											data-class={i.class}
											data-text-role="meta"
										>
											<ClassChips classes={[i.class]} />
											<span>
												{formatInput(i)}
												{#if link}
													· <a
														class="hit-stretch"
														href={link.href}
														rel="noopener noreferrer"
														target="_blank">{link.host}</a
													>{#if link.detail}&nbsp;({link.detail}){/if}
												{:else if i.source && i.class === 'live'}
													· {i.source}
												{/if}
												{#if when(i)}· {when(i)}{/if}
												{#if i.availability !== 'ok'}
													<span class="flag"
														>· {i.availability}{i.reason ? `: ${i.reason}` : ''}</span
													>
												{/if}
											</span>
										</li>
									{/each}
									{#if l.note}<li class="note" data-text-role="meta">{l.note}</li>{/if}
									{#if l.reason}<li class="flag" data-text-role="meta">{l.reason}</li>{/if}
								</ul>
							</details>
						{/each}
					</div>
				{/each}
				<div class="sec total">
					<div class="sec-head">
						<h2 data-text-role="section-title">Total</h2>
						<span class="num" data-text-role="label"
							>{usd(h.burnMonthly)}
							<span class="meta">/mo · calculated, mixed provenance</span></span
						>
					</div>
				</div>
			</section>

			<div class="side">
				<section>
					<h3 data-text-role="label">How to read a line</h3>
					<ul data-text-role="label">
						<li>
							<ClassChips classes={['live']} /> Live: our own read, dated when the source saw it
						</li>
						<li><ClassChips classes={['cited']} /> Cited: a published figure, with its date</li>
						<li><ClassChips classes={['persona']} /> Persona: an assumption about this family</li>
						<li>
							A line is quantity × price. The total is calculated, mixed provenance. If a required
							line can’t be read, the page says <i>incomplete</i> and hides the break-even.
						</li>
					</ul>
				</section>
				<section>
					<h3 data-text-role="label">Not modelled</h3>
					<p data-text-role="label">{p.notModelled.join(', ')}.</p>
				</section>
				<section>
					<h3 data-text-role="label">Method</h3>
					<p data-text-role="label">
						All income is treated as W-2 wages{p.equation ? `, split ${p.equation.split}` : ''}.
						401(k) deferrals cut income tax, not FICA. Federal and California are computed
						separately: the SALT cap with its {p.taxYear} phase-down, the $750k and $1M mortgage limits,
						Additional Medicare, SDI with no cap. Flat parcel taxes are paid but not deducted. It’s an
						estimate, not tax advice.
						{#if data.computedAt}Priced {day(data.computedAt)}.{/if}
					</p>
				</section>
			</div>
		{:else}
			<p class="fiction" data-fiction data-text-role="meta">{FICTION_LABEL}</p>
			<p data-text-role="body" data-unavailable>
				The {data.town} household’s budget can’t be read right now.
			</p>
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
	.crumb,
	.note {
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
	.tracker {
		display: flex;
		gap: 6px;
		align-items: baseline;
	}
	.tracker > :global(.chips) {
		margin-left: 0;
	}
	.towns {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		margin-left: 12px;
	}
	.towns [aria-current='page'] {
		color: var(--text-primary);
		font-weight: 600;
	}
	.head {
		display: grid;
		gap: 18px;
		grid-template-columns: minmax(0, 1fr);
	}
	@media (min-width: 860px) {
		.head {
			grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
			align-items: start;
		}
	}
	h1,
	h2,
	h3 {
		margin: 0;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.who p {
		margin: 0;
		color: var(--text-secondary);
		max-width: 62ch;
	}
	.fiction,
	.incomplete,
	.flag {
		color: var(--amber, #f59e0b);
	}
	.fiction {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0;
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
		margin-left: 8px;
	}
	.equation {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 14px;
		border: 1px solid var(--border-light);
		border-radius: 8px;
	}
	.equation p {
		margin: 0;
	}
	.big {
		margin: 0;
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		color: var(--text-secondary);
	}
	.row.total {
		border-top: 1px solid var(--border-light);
		padding-top: 6px;
		color: var(--text-primary);
		font-weight: 500;
	}
	/* The approved mockup's "For scale" boxes: the figure big, the sentence under it. */
	.scale {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.scale h2 {
		color: var(--text-muted);
		font-weight: 400;
	}
	.scale ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	}
	.scale li {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		padding: 10px 12px;
		border: 1px solid var(--border-light);
		border-radius: 8px;
	}
	.scale li.plain {
		justify-content: center;
	}
	.scale .x {
		font-weight: 600;
	}
	.scale .y {
		color: var(--text-secondary);
	}
	.modelled {
		color: var(--amber, #f59e0b);
	}
	.budget {
		display: flex;
		flex-direction: column;
	}
	.sec {
		border-top: 1px solid var(--border-light);
		padding-block: 10px;
	}
	.sec-head {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
		align-items: baseline;
	}
	.sec-head h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 500;
		text-transform: capitalize;
	}
	.bar {
		grid-column: 1 / -1;
		position: relative;
		height: 4px;
		border-radius: 2px;
		overflow: hidden;
		background: rgba(148, 163, 184, 0.12);
	}
	.bar i {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: 2px;
	}
	.sw {
		display: inline-block;
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}
	details {
		border-bottom: 1px solid var(--border);
	}
	details:last-child {
		border-bottom: 0;
	}
	summary {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 8px;
		padding: 6px 0;
		list-style: none;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.lab {
		min-width: 0;
		color: var(--text-secondary);
	}
	.lab::before {
		content: '▸';
		display: inline-block;
		width: 14px;
		color: var(--text-muted);
		transition: transform 0.15s;
	}
	details[open] .lab::before {
		transform: rotate(90deg);
	}
	.lab .flag {
		margin-left: 6px;
	}
	.inputs {
		display: flex;
		flex-direction: column;
		gap: 3px;
		margin: 0 0 8px 14px;
		padding: 0;
		list-style: none;
		color: var(--text-muted);
	}
	.inputs li {
		display: flex;
		gap: 6px;
		align-items: baseline;
		overflow-wrap: anywhere;
	}
	/* A source's row is its link's hit area (MOBILE1): its line centred, so a finger aimed at
	   the link has the row's height around it. */
	.inputs li.hit-row {
		align-items: center;
	}
	.inputs li > :global(.chips) {
		margin-left: 0;
	}
	.note {
		font-style: italic;
	}
	.side {
		display: grid;
		gap: 14px;
		grid-template-columns: minmax(0, 1fr);
	}
	@media (min-width: 860px) {
		.side {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	.side section {
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-secondary);
	}
	.side h3 {
		margin-bottom: 6px;
		font-weight: 500;
		color: var(--text-primary);
	}
	.side p,
	.side ul {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.lab::before {
			transition: none;
		}
	}
	/* Touch: the budget's lines stack edge to edge, so each is a full 44 px row (MOBILE1). */
	@media (pointer: coarse) {
		summary {
			min-height: 44px;
			align-items: center;
		}
	}
	/* Touch: a source's row stacks on the next, so it is a full 44 px row (MOBILE1). */
	@media (pointer: coarse) {
		.inputs li.hit-row {
			min-height: 44px;
		}
	}
</style>
