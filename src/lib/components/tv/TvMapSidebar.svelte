<script lang="ts">
	import type { NewsItem } from '$lib/types';
	import { timeAgo } from '$lib/utils';

	interface Props {
		regionLabel: string;
		weather: { temp: number; wind: string; shortForecast: string } | null;
		stories: NewsItem[];
		alerts: NewsItem[];
		loading: boolean;
	}

	let { regionLabel, weather, stories, alerts, loading }: Props = $props();
</script>

<aside class="flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(2,6,23,0.98)_0%,rgba(15,23,42,0.96)_100%)]">
	<div class="border-b border-slate-800/70 px-4 py-4">
		<div class="flex items-start justify-between gap-3">
			<div>
				<h3 class="text-[10px] font-bold uppercase tracking-[0.3em] text-sky-300/80">Regional Pulse</h3>
				<p class="mt-1 text-lg font-semibold text-slate-100">{regionLabel}</p>
			</div>
			<div class="rounded-full border border-slate-700/70 bg-slate-900/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
				{alerts.length} alerts
			</div>
		</div>

		{#if loading}
			<p class="mt-3 text-sm text-slate-500">Loading regional weather...</p>
		{:else if weather}
			<div class="mt-4 flex items-end gap-3">
				<span class="text-4xl font-black tracking-tight text-slate-100">{weather.temp}&deg;F</span>
				<div class="pb-1 text-sm text-slate-300">{weather.shortForecast}</div>
			</div>
			<div class="mt-3 flex flex-wrap gap-2">
				<span class="rounded-full border border-slate-700/70 bg-slate-900/70 px-2.5 py-1 text-[11px] text-slate-300">
					Wind {weather.wind}
				</span>
				<span class="rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-200">
					{stories.length} nearby stories
				</span>
			</div>
		{:else}
			<p class="mt-3 text-sm text-slate-500">Weather unavailable for this pass.</p>
		{/if}
	</div>

	{#if alerts.length > 0}
		<div class="border-b border-slate-800/70 px-4 py-4">
			<div class="mb-3 text-[10px] font-bold uppercase tracking-[0.28em] text-rose-300/85">On Alert</div>
			<div class="space-y-2">
			{#each alerts.slice(0, 3) as alert (alert.id)}
				<div class="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
					<div class="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-300">Alert</div>
					<p class="mt-1 text-sm leading-snug text-slate-100 line-clamp-2">{alert.title}</p>
				</div>
			{/each}
			</div>
		</div>
	{/if}

	{#if stories.length > 0}
		<div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
			<div class="mb-3 flex items-center justify-between gap-3">
				<h4 class="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Nearby Stories</h4>
				<span class="text-[10px] uppercase tracking-[0.22em] text-slate-600">{stories.length} items</span>
			</div>
			<div class="space-y-2.5">
			{#each stories.slice(0, 6) as item, i (item.id + '-' + i)}
				<div class="rounded-2xl border border-slate-800/80 bg-slate-900/70 px-3 py-3 shadow-[0_8px_20px_rgba(2,6,23,0.18)]">
					<p class="text-sm leading-snug text-slate-100 line-clamp-3">{item.title}</p>
					<div class="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em]">
						<span class="truncate text-slate-400">{item.source}</span>
						<span class="shrink-0 text-slate-500">{timeAgo(item.timestamp)}</span>
					</div>
				</div>
			{/each}
			</div>
		</div>
	{:else}
		<div class="flex flex-1 items-center px-4 py-6">
			<p class="text-sm text-slate-500">No pinned stories in this area right now.</p>
		</div>
	{/if}
</aside>
