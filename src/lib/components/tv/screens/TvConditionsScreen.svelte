<script lang="ts">
	import EnvironmentPanel from '$lib/components/panels/EnvironmentPanel.svelte';
	import TidesPanel from '$lib/components/panels/TidesPanel.svelte';
	import ConditionsPanel from '$lib/components/panels/ConditionsPanel.svelte';
</script>

<div class="h-full flex flex-col gap-2 p-2">
	<div class="flex gap-2 shrink-0" style="max-height: 40%;">
		<div class="flex-1 min-w-0 overflow-y-auto">
			<EnvironmentPanel />
		</div>
		<div class="w-80 shrink-0 overflow-y-auto">
			<ConditionsPanel />
		</div>
	</div>
	<div class="flex-1 min-h-0">
		<TidesPanel />
	</div>
</div>
