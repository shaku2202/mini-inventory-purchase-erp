<script lang="ts">
	import { humanize } from '#lib/utils/format.ts';

	let { status }: { status: string } = $props();

	const tone: Record<string, string> = {
		OPEN: 'bg-sky-100 text-sky-800 ring-sky-200',
		PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-800 ring-amber-200',
		RECEIVED: 'bg-emerald-100 text-emerald-800 ring-emerald-200'
	};
</script>

<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset {tone[status] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}">
	{humanize(status)}
</span>
