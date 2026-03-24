<script lang="ts">
  import EnvironmentPanel from '$lib/components/panels/EnvironmentPanel.svelte';
  import ConditionsPanel from '$lib/components/panels/ConditionsPanel.svelte';
</script>

<div class="flex h-full gap-2 p-2">
  <div class="flex-1 min-w-0">
    <EnvironmentPanel />
  </div>
  <div class="w-96 shrink-0">
    <ConditionsPanel />
  </div>
</div>
