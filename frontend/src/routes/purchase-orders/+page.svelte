<script lang="ts">
	import { ApiError } from '#lib/api/client.ts';
	import { purchaseOrdersApi } from '#lib/api/endpoints.ts';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import type { PageMeta, PurchaseOrder, PurchaseOrderStatus } from '#lib/types.ts';
	import { formatDate, formatMoney, humanize } from '#lib/utils/format.ts';
	import { goto } from '$app/navigation';

	let orders = $state<PurchaseOrder[]>([]);
	let meta = $state<PageMeta | null>(null);
	let loading = $state(true);
	let error = $state<ApiError | null>(null);
	let search = $state('');
	let status = $state<PurchaseOrderStatus | ''>('');
	let pageNo = $state(1);

	async function load() {
		loading = true;
		error = null;
		try {
			const res = await purchaseOrdersApi.list({ search, status, page: pageNo });
			orders = res.data;
			meta = res.meta;
		} catch (e) {
			error = e as ApiError;
		} finally {
			loading = false;
		}
	}

	let debounce: ReturnType<typeof setTimeout>;
	$effect(() => {
		void [search, status, pageNo];
		clearTimeout(debounce);
		debounce = setTimeout(load, 200);
		return () => clearTimeout(debounce);
	});

	const statuses: PurchaseOrderStatus[] = ['OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED'];
</script>

<PageHeader title="Purchase orders" subtitle="Open a PO to receive goods against it.">
	{#snippet actions()}
		<a class="btn btn-primary" href="/purchase-orders/new">+ New purchase order</a>
	{/snippet}
</PageHeader>

<div class="card">
	<div class="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row">
		<input class="input sm:max-w-xs" type="search" placeholder="PO number or vendor…  ( / )" aria-label="Search purchase orders" data-search bind:value={search} oninput={() => (pageNo = 1)} />
		<select class="input sm:max-w-52" aria-label="Filter by status" bind:value={status} onchange={() => (pageNo = 1)}>
			<option value="">All statuses</option>
			{#each statuses as s (s)}<option value={s}>{humanize(s)}</option>{/each}
		</select>
	</div>
	<div class="p-3 pb-0"><ErrorBanner {error} onretry={load} /></div>

	{#if loading && orders.length === 0}
		<Spinner />
	{:else if orders.length === 0 && !error}
		<EmptyState title="No purchase orders found">
			<a class="text-indigo-600 underline" href="/purchase-orders/new">Create the first purchase order</a>
		</EmptyState>
	{:else}
		<div class="overflow-x-auto">
			<table class="table-erp">
				<thead><tr><th>PO number</th><th>Vendor</th><th>Order date</th><th>Status</th><th class="num">Total</th></tr></thead>
				<tbody>
					{#each orders as po (po.id)}
						<tr class="cursor-pointer" onclick={() => goto(`/purchase-orders/${po.id}`)}>
							<td><a class="font-mono text-xs font-semibold text-indigo-700 hover:underline" href="/purchase-orders/{po.id}">{po.poNumber}</a></td>
							<td>{po.vendorName}</td>
							<td class="whitespace-nowrap">{formatDate(po.orderDate)}</td>
							<td><StatusBadge status={po.status} /></td>
							<td class="num font-medium">{formatMoney(po.totalAmount)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if meta && meta.totalPages > 1}
			<div class="flex items-center justify-end gap-2 p-3 text-sm">
				<button class="btn btn-secondary py-1" disabled={pageNo <= 1} onclick={() => pageNo--}>Previous</button>
				<span class="text-slate-500">Page {meta.page} of {meta.totalPages}</span>
				<button class="btn btn-secondary py-1" disabled={pageNo >= meta.totalPages} onclick={() => pageNo++}>Next</button>
			</div>
		{/if}
	{/if}
</div>
