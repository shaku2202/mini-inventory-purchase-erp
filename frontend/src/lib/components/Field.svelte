<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		id,
		error,
		hint,
		required = false,
		children
	}: { label: string; id: string; error?: string; hint?: string; required?: boolean; children: Snippet } = $props();
</script>

<div>
	<label class="label" for={id}>{label}{#if required}<span class="text-red-500"> *</span>{/if}</label>
	{@render children()}
	{#if error}
		<p class="mt-1 text-xs text-red-600" id="{id}-error">{error}</p>
	{:else if hint}
		<p class="mt-1 text-xs text-slate-500">{hint}</p>
	{/if}
</div>
