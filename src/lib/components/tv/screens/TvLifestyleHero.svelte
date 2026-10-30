<!-- The TV's Cost hero under the Lifestyle Index (LIFE2, COST1): the household of the day, fiction-labelled. -->
<script lang="ts">
	import SectionStack from '$lib/components/lifestyle/SectionStack.svelte';
	import { COST_DATASETS } from '$lib/dashboard/cost';
	import {
		dailySlug,
		FICTION_LABEL,
		lineTally,
		pricedSoFar,
		SECTION_COLOR,
		spendingSections,
		type LifestyleCard
	} from '$lib/lifestyle/view';

	let { data }: { data: LifestyleCard | null } = $props();

	const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
	const pct = (share: number) => (share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);
	const MAX_AGE_MS = COST_DATASETS.lifestyle.maxAgeDays * 86_400_000;
	/** No run has priced every household on in-date reads within the index's max age. */
	const outOfDate = $derived.by(() => {
		const at = Date.parse(data?.lastSuccessfulScrapeAt ?? '');
		return !(Date.now() - at <= MAX_AGE_MS);
	});
	const h = $derived.by(() => {
		const all = data?.households ?? [];
		if (!all.length) return null;
		const slug = dailySlug(
			all.map((x) => x.slug),
			Date.now()
		);
		return all.find((x) => x.slug === slug) ?? null;
	});
	const soFar = $derived(!!h && pricedSoFar(h));
	/** The right half's highlights, below the receipt: the ones with a figure, four at most. */
	const highlights = $derived((h?.highlights ?? []).filter((x) => x.figure !== null).slice(0, 4));
</script>

{#if !h}
	<div class="h-full flex items-center justify-center">
		<p class="text-lg text-zinc-500">
			{data ? 'No household could be read.' : 'Loading cost data...'}
		</p>
	</div>
{:else}
	<div class="h-full flex flex-col gap-4 overflow-hidden px-8 py-5" data-tv-lifestyle={h.slug}>
		<div class="flex items-baseline justify-between gap-4 shrink-0">
			<h2 class="text-xl font-semibold text-gray-100">What it takes to live in {h.town}</h2>
			<span class="text-base font-medium text-amber-400" data-fiction>● {FICTION_LABEL}</span>
		</div>

		{#if outOfDate || h.stale}
			<p class="text-lg font-medium text-amber-400 shrink-0" data-tv-stale>
				{#if outOfDate}No weekly run has priced every household on in-date reads in ten days: these
					numbers may be out of date.{/if}
				{#if h.stale}{h.stale} {h.stale === 1 ? 'line reads' : 'lines read'} stale.{/if}
			</p>
		{/if}
		<div class="flex-1 grid grid-cols-2 gap-6 min-h-0">
			<div class="flex flex-col gap-4 min-w-0">
				<div>
					<div class="text-6xl font-bold tabular-nums text-white" data-burn>
						{usd(h.burnMonthly)}<span class="text-2xl text-zinc-400 font-normal">
							{' '}a month{soFar ? ' so far' : ''}</span
						>
					</div>
					{#if h.complete && h.breakEven !== null}
						<div class="text-lg text-zinc-400 mt-1" data-break-even>
							To break even: {usd(h.breakEven)} a year before tax
						</div>
					{:else if !h.complete}
						<div class="text-lg font-semibold text-amber-400 mt-1" data-incomplete>
							incomplete: no break-even while {h.missing.join(', ')} can’t be read
						</div>
					{/if}
				</div>
				{#if h.complete}
					<p class="text-xl text-zinc-300">The {h.name}, going out, before saving anything.</p>
				{/if}
				<SectionStack sections={h.sections} height={22} />
				<div class="grid grid-cols-2 gap-x-8 gap-y-1">
					{#each spendingSections(h.sections) as s (s.section)}
						<div class="flex items-baseline justify-between gap-3 py-1 border-b border-gray-800">
							<span class="flex items-center gap-2 text-lg text-zinc-300 capitalize"
								><i
									class="inline-block w-3 h-3 rounded-sm"
									style:background={SECTION_COLOR[s.section]}
								></i>{s.section}</span
							>
							<span class="text-lg tabular-nums text-zinc-200"
								>{usd(s.monthly)}<span class="text-sm text-zinc-500">
									/mo{s.partial ? ' so far' : ` · ${pct(s.share)}`}</span
								></span
							>
						</div>
					{/each}
				</div>
			</div>

			<div class="flex flex-col gap-2 min-w-0 min-h-0">
				<div class="text-sm font-semibold uppercase tracking-wider text-zinc-500">
					{h.receipt.length} of the {h.lineCount} lines
				</div>
				{#each h.receipt as l (l.id)}
					<div
						class="flex items-baseline justify-between gap-3 py-2 border-b border-gray-700/50 shrink-0"
						data-tv-receipt
					>
						<span class="text-xl text-zinc-200 min-w-0"
							>{l.label}{#if l.availability === 'stale'}<span class="ml-2 text-base text-amber-400"
									>stale</span
								>{/if}{#if l.note}<span class="block text-base text-zinc-400">{l.note}</span
								>{/if}</span
						>
						{#if l.monthly === null}
							<span class="text-xl font-semibold text-amber-400 shrink-0">can’t be read</span>
						{:else}
							<span class="text-2xl font-bold tabular-nums text-zinc-100 shrink-0"
								>{usd(l.monthly)}</span
							>
						{/if}
					</div>
				{/each}
				<div class="flex justify-between gap-3 pt-1 text-lg text-zinc-400 shrink-0" data-tv-total>
					<span>{lineTally(h)}</span>
					<span class="tabular-nums">{usd(h.burnMonthly)} a month{soFar ? ' so far' : ''}</span>
				</div>
				<!-- A column that wraps out of its own clipped box: only whole highlights ever show. The
				     empty first item is what lets even the first highlight wrap away rather than be cut. -->
				<div
					class="flex-1 min-h-0 basis-0 flex flex-col flex-wrap gap-3 overflow-hidden"
					data-tv-highlights
				>
					<span class="w-full h-0" aria-hidden="true"></span>
					{#each highlights as x, i (x.key)}
						<div class="w-full flex flex-col gap-3">
							{#if i === 0}
								<div class="text-sm font-semibold uppercase tracking-wider text-zinc-500">
									For scale
								</div>
							{/if}
							<div class="flex items-baseline gap-4" data-highlight={x.key}>
								<span class="w-32 shrink-0 text-3xl font-bold tabular-nums text-white"
									>{x.figure}</span
								>
								<span class="min-w-0 text-lg leading-snug text-zinc-300"
									>{x.text}{#if x.modelled}<span class="ml-2 text-base text-amber-400" data-modelled
											>modelled</span
										>{/if}</span
								>
							</div>
						</div>
					{/each}
				</div>
				<p class="shrink-0 pt-4 text-base text-zinc-500" data-tv-footer>
					{h.inputs.live} live, {h.inputs.cited} cited, {h.inputs.persona} persona inputs · {Math.round(
						h.personaOnly * 100
					)}% of spending is persona-only · marinmonitor.com/cost/{h.slug}
				</p>
			</div>
		</div>
	</div>
{/if}
