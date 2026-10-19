<script lang="ts">
	let { label = 'Loading…' }: { label?: string } = $props();
</script>

<div class="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
	<span class="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"></span>
	{label}
</div>
