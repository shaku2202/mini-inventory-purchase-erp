<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, subtitle, actions }: { title: string; subtitle?: string; actions?: Snippet } = $props();
</script>

<header class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
	<div>
		<h1 class="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
		{#if subtitle}<p class="mt-0.5 text-sm text-slate-500">{subtitle}</p>{/if}
	</div>
	{#if actions}<div class="flex flex-wrap gap-2">{@render actions()}</div>{/if}
</header>
