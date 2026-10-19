<script lang="ts">
	import type { ApiError } from '#lib/api/client.ts';

	let { error, onretry }: { error: ApiError | null; onretry?: () => void } = $props();
</script>

{#if error}
	<div role="alert" class="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
		<div class="flex flex-wrap items-start justify-between gap-2">
			<div>
				<p class="font-semibold">{error.message}</p>
				<p class="mt-0.5 text-xs text-red-700/80">
					Code: {error.code}{#if error.requestId} · Ref: {error.requestId}{/if}
				</p>
			</div>
			{#if onretry}<button class="btn btn-secondary py-1" onclick={onretry}>Retry</button>{/if}
		</div>
	</div>
{/if}
