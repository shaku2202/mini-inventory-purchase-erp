<script lang="ts">
	import { ApiError } from '#lib/api/client.ts';
	import { productsApi } from '#lib/api/endpoints.ts';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import Field from '#lib/components/Field.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { toast } from '#lib/stores/toast.svelte.ts';
	import { PRODUCT_UNITS, type Product, type ProductUnit } from '#lib/types.ts';
	import { formatQty } from '#lib/utils/format.ts';

	let products = $state<Product[]>([]);
	let loading = $state(true);
	let loadError = $state<ApiError | null>(null);
	let search = $state('');

	const emptyForm = () => ({ sku: '', name: '', unit: 'SQM' as ProductUnit, reorderLevel: '0', description: '' });
	let form = $state(emptyForm());
	let fieldErrors = $state<Record<string, string>>({});
	let submitError = $state<ApiError | null>(null);
	let saving = $state(false);
	let showForm = $state(false);

	async function load() {
		loading = true;
		loadError = null;
		try {
			products = (await productsApi.list({ search })).data;
		} catch (e) {
			loadError = e as ApiError;
		} finally {
			loading = false;
		}
	}

	let debounce: ReturnType<typeof setTimeout>;
	$effect(() => {
		void search;
		clearTimeout(debounce);
		debounce = setTimeout(load, 250);
		return () => clearTimeout(debounce);
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		fieldErrors = {};
		submitError = null;
		try {
			const { data } = await productsApi.create(form);
			toast.success('Product created', `${data.sku} · ${data.name}`);
			form = emptyForm();
			showForm = false;
			await load();
		} catch (e) {
			const err = e as ApiError;
			fieldErrors = err.fieldErrors;
			if (err.code === 'PRODUCT_SKU_EXISTS') fieldErrors = { sku: err.message };
			else submitError = err;
		} finally {
			saving = false;
		}
	}
</script>

<PageHeader title="Products" subtitle="Raw materials and consumables. Opening stock is always zero - stock is added through goods receipts.">
	{#snippet actions()}
		<button class="btn btn-primary" onclick={() => (showForm = !showForm)}>{showForm ? 'Close' : '+ Add product'}</button>
	{/snippet}
</PageHeader>

{#if showForm}
	<form class="card mb-5 p-4 sm:p-5" onsubmit={submit} novalidate>
		<h2 class="mb-4 font-semibold text-slate-900">New product</h2>
		<ErrorBanner error={submitError} />
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<Field label="SKU" id="sku" required error={fieldErrors.sku}>
				<input id="sku" class="input uppercase" class:input-error={fieldErrors.sku} bind:value={form.sku} maxlength="40" />
			</Field>
			<div class="lg:col-span-2">
				<Field label="Name" id="name" required error={fieldErrors.name}>
					<input id="name" class="input" class:input-error={fieldErrors.name} bind:value={form.name} maxlength="150" />
				</Field>
			</div>
			<Field label="Unit" id="unit" required error={fieldErrors.unit}>
				<select id="unit" class="input" bind:value={form.unit}>
					{#each PRODUCT_UNITS as unit (unit)}<option value={unit}>{unit}</option>{/each}
				</select>
			</Field>
			<Field label="Reorder level" id="reorderLevel" error={fieldErrors.reorderLevel}>
				<input id="reorderLevel" class="input" class:input-error={fieldErrors.reorderLevel} inputmode="decimal" bind:value={form.reorderLevel} />
			</Field>
			<div class="sm:col-span-2 lg:col-span-3">
				<Field label="Description" id="description" error={fieldErrors.description}>
					<input id="description" class="input" bind:value={form.description} />
				</Field>
			</div>
		</div>
		<div class="mt-4 flex justify-end gap-2">
			<button type="button" class="btn btn-secondary" onclick={() => (showForm = false)}>Cancel</button>
			<button class="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save product'}</button>
		</div>
	</form>
{/if}

<div class="card">
	<div class="border-b border-slate-200 p-3">
		<input class="input sm:max-w-xs" type="search" placeholder="Search SKU or name…  ( / )" aria-label="Search products" data-search bind:value={search} />
	</div>
	<div class="p-3 pb-0"><ErrorBanner error={loadError} onretry={load} /></div>
	{#if loading && products.length === 0}
		<Spinner />
	{:else if products.length === 0 && !loadError}
		<EmptyState title="No products found" />
	{:else}
		<div class="overflow-x-auto">
			<table class="table-erp">
				<thead><tr><th>SKU</th><th>Name</th><th>Unit</th><th class="num">Reorder level</th><th class="num">Stock</th></tr></thead>
				<tbody>
					{#each products as p (p.id)}
						<tr>
							<td class="font-mono text-xs">{p.sku}</td>
							<td>
								<p class="font-medium text-slate-900">{p.name}</p>
								{#if p.description}<p class="text-xs text-slate-500">{p.description}</p>{/if}
							</td>
							<td>{p.unit}</td>
							<td class="num">{formatQty(p.reorderLevel)}</td>
							<td class="num font-semibold"><a class="hover:underline" href="/inventory/{p.id}">{formatQty(p.currentStock)}</a></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
