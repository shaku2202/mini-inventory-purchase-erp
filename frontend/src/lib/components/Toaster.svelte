<script lang="ts">
	import { toast } from '#lib/stores/toast.svelte.ts';

	const styles = {
		success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
		error: 'border-red-300 bg-red-50 text-red-900',
		info: 'border-sky-300 bg-sky-50 text-sky-900'
	} as const;
	const icons = { success: '✓', error: '!', info: 'i' } as const;
</script>

<div class="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3 sm:top-auto sm:right-4 sm:bottom-4 sm:left-auto sm:items-end" aria-live="polite">
	{#each toast.items as t (t.id)}
		<div role={t.kind === 'error' ? 'alert' : 'status'} class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-3 shadow-lg {styles[t.kind]}">
			<span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-current text-xs font-bold">{icons[t.kind]}</span>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold">{t.title}</p>
				{#if t.message}<p class="mt-0.5 text-sm break-words opacity-90">{t.message}</p>{/if}
			</div>
			<button class="text-lg leading-none opacity-60 hover:opacity-100" aria-label="Dismiss" onclick={() => toast.dismiss(t.id)}>×</button>
		</div>
	{/each}
</div>
