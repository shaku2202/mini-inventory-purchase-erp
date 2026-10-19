<script lang="ts">
	import { ApiError } from '#lib/api/client.ts';
	import { inventoryApi } from '#lib/api/endpoints.ts';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import type { PageMeta, Product, StockMovement } from '#lib/types.ts';
	import { formatDateTime, formatQty, humanize } from '#lib/utils/format.ts';
	import { page } from '$app/state';

	const productId = $derived(Number(page.params.id));

	let product = $state<Product | null>(null);
	let movements = $state<StockMovement[]>([]);
	let meta = $state<PageMeta | null>(null);
	let pageNo = $state(1);
	let loading = $state(true);
	let error = $state<ApiError | null>(null);

	async function load() {
		loading = true;
		error = null;
		try {
			const res = await inventoryApi.movements(productId, { page: pageNo, limit: 25 });
			product = res.data.product;
			movements = res.data.movements;
			meta = res.meta;
		} catch (e) {
			error = e as ApiError;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void productId;
		void pageNo;
		load();
	});
</script>

<a href="/" class="mb-3 inline-block text-sm text-indigo-600 hover:underline">← Inventory</a>

<PageHeader
	title={product ? product.name : 'Stock ledger'}
	subtitle={product ? `${product.sku} · every change to this product's stock, newest first` : undefined}
/>

<ErrorBanner {error} onretry={load} />

{#if product}
	<div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
		<div class="card p-4">
			<p class="label">Current stock</p>
			<p class="text-2xl font-semibold text-slate-900 tabular-nums">{formatQty(product.currentStock, product.unit)}</p>
		</div>
		<div class="card p-4">
			<p class="label">Reorder level</p>
			<p class="text-2xl font-semibold text-slate-900 tabular-nums">{formatQty(product.reorderLevel, product.unit)}</p>
		</div>
		<div class="card col-span-2 p-4 sm:col-span-1">
			<p class="label">Movements</p>
			<p class="text-2xl font-semibold text-slate-900 tabular-nums">{meta?.total ?? 0}</p>
		</div>
	</div>
{/if}

<div class="card">
	{#if loading && movements.length === 0}
		<Spinner />
	{:else if movements.length === 0 && !error}
		<EmptyState title="No stock movements yet">Stock increases when goods are received against a purchase order.</EmptyState>
	{:else}
		<div class="overflow-x-auto">
			<table class="table-erp">
				<thead>
					<tr><th>Date</th><th>Type</th><th>Reference</th><th class="num">Quantity</th><th class="num">Balance after</th><th>Remarks</th></tr>
				</thead>
				<tbody>
					{#each movements as m (m.id)}
						<tr>
							<td class="text-xs whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
							<td>{humanize(m.movementType)}</td>
							<td class="font-mono text-xs">{m.referenceNumber ?? `${m.referenceType} #${m.referenceId}`}</td>
							<td class="num font-medium {Number(m.quantity) >= 0 ? 'text-emerald-700' : 'text-red-700'}">
								{Number(m.quantity) >= 0 ? '+' : ''}{formatQty(m.quantity)}
							</td>
							<td class="num">{formatQty(m.balanceAfter)}</td>
							<td class="text-xs text-slate-500">{m.remarks ?? ''}</td>
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
