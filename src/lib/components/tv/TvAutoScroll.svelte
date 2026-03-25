<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    speed?: number;
  }

  let { children, speed = 15 }: Props = $props();

  let containerEl = $state<HTMLDivElement | null>(null);
  let contentEl = $state<HTMLDivElement | null>(null);
  let needsScroll = $state(false);
  let duration = $state(60);
  let checkTimer: ReturnType<typeof setInterval> | null = null;

  function checkOverflow() {
    if (!containerEl || !contentEl) return;
    const contentHeight = contentEl.scrollHeight;
    const containerHeight = containerEl.clientHeight;
    const shouldScroll = contentHeight > containerHeight + 10;
    if (shouldScroll !== needsScroll) {
      needsScroll = shouldScroll;
    }
    if (needsScroll) {
      duration = contentHeight / speed;
    }
  }

  onMount(() => {
    // Check overflow periodically — store data may arrive after mount
    checkOverflow();
    checkTimer = setInterval(checkOverflow, 2000);
  });

  onDestroy(() => {
    if (checkTimer) clearInterval(checkTimer);
  });

  // Also re-check when elements rebind (needsScroll flip swaps DOM)
  $effect(() => {
    const container = containerEl;
    const content = contentEl;
    if (!container || !content) return;

    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(container);
    observer.observe(content);

    return () => observer.disconnect();
  });
</script>

<div bind:this={containerEl} class="h-full overflow-hidden relative">
  {#if needsScroll}
    <div
      class="auto-scroll-track"
      style="animation-duration: {duration}s;"
    >
      <div bind:this={contentEl}>
        {@render children()}
      </div>
      <div aria-hidden="true">
        {@render children()}
      </div>
    </div>
  {:else}
    <div bind:this={contentEl}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .auto-scroll-track {
    animation: auto-scroll-vertical linear infinite;
  }
  .auto-scroll-track:hover {
    animation-play-state: paused;
  }
  @keyframes auto-scroll-vertical {
    0% { transform: translateY(0); }
    100% { transform: translateY(-50%); }
  }
</style>
