<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<div class="px-4 py-12 text-center">
	<p class="font-medium text-slate-700">{title}</p>
	{#if children}<div class="mt-2 text-sm text-slate-500">{@render children()}</div>{/if}
</div>
