<script lang="ts">
	import EnvironmentPanel from '$lib/components/panels/EnvironmentPanel.svelte';
	import TidesPanel from '$lib/components/panels/TidesPanel.svelte';
	import ConditionsPanel from '$lib/components/panels/ConditionsPanel.svelte';
</script>

<div class="h-full flex gap-2 p-2">
	<div class="flex-1 min-w-0 min-h-0 overflow-y-auto">
		<div class="flex flex-col gap-2">
			<EnvironmentPanel />
			<TidesPanel />
		</div>
	</div>
	<div class="w-72 shrink-0 overflow-y-auto">
		<ConditionsPanel />
	</div>
</div>
