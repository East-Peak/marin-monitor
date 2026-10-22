<!-- The TV's Cost hero under the Lifestyle Index (LIFE2): the household of the day, fiction-labelled. -->
<script lang="ts">
	import ClassChips from '$lib/components/lifestyle/ClassChips.svelte';
	import SectionStack from '$lib/components/lifestyle/SectionStack.svelte';
	import { dailySlug, FICTION_LABEL, SECTION_COLOR, type LifestyleCard } from '$lib/lifestyle/view';

	let { data }: { data: LifestyleCard | null } = $props();

	const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
	const pct = (share: number) => (share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);
	const h = $derived.by(() => {
		const all = data?.households ?? [];
		if (!all.length) return null;
		const slug = dailySlug(
			all.map((x) => x.slug),
			Date.now()
		);
		return all.find((x) => x.slug === slug) ?? null;
	});
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

		<div class="flex-1 grid grid-cols-2 gap-6 min-h-0">
			<div class="flex flex-col gap-4 min-w-0">
				{#if h.complete && h.breakEven !== null}
					<div>
						<div class="text-6xl font-bold tabular-nums text-white" data-break-even>
							{usd(h.breakEven)}<span class="text-2xl text-zinc-400 font-normal">/yr</span>
						</div>
						<div class="text-lg text-zinc-400 mt-1">pre-tax, to break even</div>
					</div>
					<p class="text-xl text-zinc-300">
						The {h.name}: {usd(h.burnMonthly)} a month going out, before saving anything.
					</p>
				{:else}
					<div>
						<div class="text-6xl font-bold tabular-nums text-white" data-burn>
							{usd(h.burnMonthly)}<span class="text-2xl text-zinc-400 font-normal">/mo so far</span>
						</div>
						<div class="text-lg font-semibold text-amber-400 mt-1" data-incomplete>
							incomplete: no break-even while {h.missing.join(', ')} can’t be read
						</div>
					</div>
				{/if}
				<SectionStack sections={h.sections} height={22} />
				<div class="grid grid-cols-2 gap-x-8 gap-y-1">
					{#each h.sections.filter((s) => s.monthly > 0) as s (s.section)}
						<div class="flex items-baseline justify-between gap-3 py-1 border-b border-gray-800">
							<span class="flex items-center gap-2 text-lg text-zinc-300 capitalize"
								><i
									class="inline-block w-3 h-3 rounded-sm"
									style:background={SECTION_COLOR[s.section]}
								></i>{s.section}</span
							>
							<span class="text-lg tabular-nums text-zinc-200"
								>{usd(s.monthly)}<span class="text-sm text-zinc-500">
									/mo · {pct(s.share)}</span
								></span
							>
						</div>
					{/each}
				</div>
			</div>

			<div class="flex flex-col gap-2 min-w-0">
				<div class="text-sm font-semibold uppercase tracking-wider text-zinc-500">
					The three biggest lines
				</div>
				{#each h.top as l (l.id)}
					<div class="flex items-baseline justify-between gap-3 py-2 border-b border-gray-700/50">
						<span class="text-xl text-zinc-200 min-w-0"
							>{l.label}<ClassChips classes={l.classes} />{#if l.availability === 'stale'}<span
									class="ml-2 text-base text-amber-400">stale</span
								>{/if}</span
						>
						<span class="text-2xl font-bold tabular-nums text-zinc-100 shrink-0"
							>{usd(l.monthly)}</span
						>
					</div>
				{/each}
				<p class="mt-4 text-base text-zinc-500">
					{h.inputs.live} live, {h.inputs.cited} cited, {h.inputs.persona} persona inputs · {Math.round(
						h.personaOnly * 100
					)}% of spending is persona-only · marinmonitor.com/cost/{h.slug}
				</p>
			</div>
		</div>
	</div>
{/if}
