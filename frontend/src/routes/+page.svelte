<script lang="ts">
	import { ApiError } from '#lib/api/client.ts';
	import { inventoryApi } from '#lib/api/endpoints.ts';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import type { InventoryItem, PageMeta } from '#lib/types.ts';
	import { formatDateTime, formatQty } from '#lib/utils/format.ts';

	let items = $state<InventoryItem[]>([]);
	let meta = $state<PageMeta | null>(null);
	let loading = $state(true);
	let error = $state<ApiError | null>(null);

	let search = $state('');
	let lowStockOnly = $state(false);
	let pageNo = $state(1);

	async function load() {
		loading = true;
		error = null;
		try {
			const res = await inventoryApi.list({ search, lowStockOnly, page: pageNo });
			items = res.data;
			meta = res.meta;
		} catch (e) {
			error = e as ApiError;
		} finally {
			loading = false;
		}
	}

	// Reload whenever filters change (search is debounced).
	let debounce: ReturnType<typeof setTimeout>;
	$effect(() => {
		const deps = [search, lowStockOnly, pageNo];
		clearTimeout(debounce);
		debounce = setTimeout(load, deps[0] ? 250 : 0);
		return () => clearTimeout(debounce);
	});

	const lowCount = $derived(items.filter((i) => i.isLowStock).length);
</script>

<PageHeader title="Inventory" subtitle="Current stock per product. Stock only changes through goods receipts, each one recorded in the movement ledger.">
	{#snippet actions()}
		<a class="btn btn-primary" href="/purchase-orders/new">+ New purchase order</a>
	{/snippet}
</PageHeader>

<div class="card">
	<div class="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
		<input
			class="input sm:max-w-xs"
			type="search"
			placeholder="Search SKU or name…  ( / )"
			aria-label="Search products"
			data-search
			bind:value={search}
			oninput={() => (pageNo = 1)}
		/>
		<label class="flex items-center gap-2 text-sm text-slate-600">
			<input type="checkbox" class="size-4 accent-indigo-600" bind:checked={lowStockOnly} onchange={() => (pageNo = 1)} />
			Low stock only
		</label>
		{#if meta}
			<span class="text-xs text-slate-500 sm:ml-auto">{meta.total} product(s){#if lowCount} · {lowCount} below reorder level on this page{/if}</span>
		{/if}
	</div>

	<div class="p-3 pb-0"><ErrorBanner {error} onretry={load} /></div>

	{#if loading && items.length === 0}
		<Spinner />
	{:else if items.length === 0 && !error}
		<EmptyState title="No products found">
			Create products under <a class="text-indigo-600 underline" href="/products">Products</a>.
		</EmptyState>
	{:else}
		<div class="overflow-x-auto">
			<table class="table-erp">
				<thead>
					<tr>
						<th>SKU</th>
						<th>Product</th>
						<th class="num">In stock</th>
						<th class="num">Reorder level</th>
						<th class="num">Incoming (open POs)</th>
						<th>Last movement</th>
						<th></th>
					</tr>
				</thead>
				<tbody class:opacity-60={loading}>
					{#each items as item (item.id)}
						<tr>
							<td class="font-mono text-xs">{item.sku}</td>
							<td>
								<span class="font-medium text-slate-900">{item.name}</span>
								{#if item.isLowStock}<span class="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">Low</span>{/if}
							</td>
							<td class="num font-semibold {item.isLowStock ? 'text-red-700' : 'text-slate-900'}">{formatQty(item.currentStock, item.unit)}</td>
							<td class="num text-slate-500">{formatQty(item.reorderLevel)}</td>
							<td class="num text-slate-500">{formatQty(item.incomingQuantity)}</td>
							<td class="text-xs whitespace-nowrap text-slate-500">{formatDateTime(item.lastMovementAt)}</td>
							<td class="text-right"><a class="text-xs font-medium whitespace-nowrap text-indigo-600 hover:underline" href="/inventory/{item.id}">Ledger →</a></td>
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
