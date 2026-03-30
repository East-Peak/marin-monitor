<script lang="ts">
	import TvAutoScroll from '$lib/components/tv/TvAutoScroll.svelte';
	import EnvironmentPanel from '$lib/components/panels/EnvironmentPanel.svelte';
	import TidesPanel from '$lib/components/panels/TidesPanel.svelte';
	import ConditionsPanel from '$lib/components/panels/ConditionsPanel.svelte';
</script>

<div class="flex h-full min-h-0 gap-3 bg-slate-950 p-3">
	<div class="tv-conditions-column flex-1 min-h-0 min-w-0 overflow-hidden rounded-[1.6rem] border border-slate-800/80 bg-slate-950/80 p-2">
		<TvAutoScroll speed={18}>
			<div class="tv-conditions-scale tv-conditions-scale-primary">
				<div class="flex flex-col gap-3">
					<EnvironmentPanel />
					<TidesPanel />
				</div>
			</div>
		</TvAutoScroll>
	</div>
	<div class="tv-conditions-column tv-conditions-sidebar min-h-0 overflow-hidden rounded-[1.6rem] border border-slate-800/80 bg-slate-950/80 p-2">
		<TvAutoScroll speed={14}>
			<div class="tv-conditions-scale tv-conditions-scale-secondary">
				<ConditionsPanel />
			</div>
		</TvAutoScroll>
	</div>
</div>

<style>
	.tv-conditions-scale {
		transform-origin: top left;
	}

	.tv-conditions-scale-primary {
		transform: scale(1.08);
		width: calc(100% / 1.08);
		padding-bottom: 2rem;
	}

	.tv-conditions-scale-secondary {
		transform: scale(1.03);
		width: calc(100% / 1.03);
		padding-bottom: 1.5rem;
	}

	.tv-conditions-sidebar {
		flex: 0 0 clamp(19rem, 26vw, 24rem);
		width: clamp(19rem, 26vw, 24rem);
	}

	:global(.tv-conditions-column .panel) {
		border-radius: 1.2rem;
		border-color: rgba(51, 65, 85, 0.9);
		background: rgba(15, 23, 42, 0.9);
	}

	:global(.tv-conditions-column .panel-header) {
		padding: 0.75rem 1rem;
		min-height: 2.5rem;
	}

	:global(.tv-conditions-column .panel-title) {
		font-size: 0.76rem;
		letter-spacing: 0.12em;
		color: rgb(226, 232, 240);
	}

	:global(.tv-conditions-column .panel-content) {
		padding: 0.9rem 1rem 1rem;
	}
</style>
