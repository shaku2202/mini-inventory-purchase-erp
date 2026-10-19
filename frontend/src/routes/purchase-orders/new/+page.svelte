<script lang="ts">
	import { ApiError } from '#lib/api/client.ts';
	import { productsApi, purchaseOrdersApi, vendorsApi } from '#lib/api/endpoints.ts';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import Field from '#lib/components/Field.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { toast } from '#lib/stores/toast.svelte.ts';
	import type { Product, Vendor } from '#lib/types.ts';
	import { formatMoney, previewLineTotal, today } from '#lib/utils/format.ts';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';

	interface Line {
		uid: number;
		productId: string;
		quantity: string;
		unitPrice: string;
	}

	let vendors = $state<Vendor[]>([]);
	let products = $state<Product[]>([]);
	let loadError = $state<ApiError | null>(null);

	let vendorId = $state('');
	let orderDate = $state(today());
	let expectedDate = $state('');
	let notes = $state('');
	let uid = 0;
	let lines = $state<Line[]>([{ uid: ++uid, productId: '', quantity: '', unitPrice: '' }]);

	let fieldErrors = $state<Record<string, string>>({});
	let submitError = $state<ApiError | null>(null);
	let saving = $state(false);

	async function loadMasters() {
		loadError = null;
		try {
			const [v, p] = await Promise.all([vendorsApi.list(), productsApi.list()]);
			vendors = v.data.filter((x) => x.isActive);
			products = p.data.filter((x) => x.isActive);
		} catch (e) {
			loadError = e as ApiError;
		}
	}
	loadMasters();

	const productById = $derived(new Map(products.map((p) => [String(p.id), p])));
	const grandTotal = $derived(lines.reduce((sum, l) => sum + previewLineTotal(l.quantity, l.unitPrice), 0));
	const usedProducts = $derived(new Set(lines.map((l) => l.productId).filter(Boolean)));

	async function addLine() {
		lines.push({ uid: ++uid, productId: '', quantity: '', unitPrice: '' });
		await tick();
		document.querySelector<HTMLSelectElement>(`#product-${lines.length - 1}`)?.focus();
	}

	function removeLine(index: number) {
		if (lines.length > 1) lines.splice(index, 1);
		fieldErrors = {};
	}

	async function submit(event?: SubmitEvent) {
		event?.preventDefault();
		if (saving) return;
		saving = true;
		fieldErrors = {};
		submitError = null;
		try {
			const { data } = await purchaseOrdersApi.create({
				vendorId: vendorId ? Number(vendorId) : undefined,
				orderDate: orderDate || undefined,
				expectedDate: expectedDate || undefined,
				notes: notes || undefined,
				items: lines.map((l) => ({ productId: l.productId ? Number(l.productId) : undefined, quantity: l.quantity, unitPrice: l.unitPrice }))
			});
			toast.success(`Purchase order ${data.poNumber} created`, `Total ${formatMoney(data.totalAmount)}`);
			goto(`/purchase-orders/${data.id}`);
		} catch (e) {
			const err = e as ApiError;
			fieldErrors = err.fieldErrors;
			submitError = err;
			toast.error('Purchase order not saved', err.message);
		} finally {
			saving = false;
		}
	}

	/** Alt+A add line · Ctrl+Enter save */
	function onKeydown(event: KeyboardEvent) {
		if (event.altKey && event.key.toLowerCase() === 'a') {
			event.preventDefault();
			addLine();
		} else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			submit();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<a href="/purchase-orders" class="mb-3 inline-block text-sm text-indigo-600 hover:underline">← Purchase orders</a>
<PageHeader title="New purchase order" subtitle="Totals are previewed here; the saved PO total is calculated by the server." />

<ErrorBanner error={loadError} onretry={loadMasters} />

<form class="space-y-5" onsubmit={submit} novalidate>
	<div class="card grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
		<div class="sm:col-span-2">
			<Field label="Vendor" id="vendorId" required error={fieldErrors.vendorId}>
				<select id="vendorId" class="input" class:input-error={fieldErrors.vendorId} bind:value={vendorId}>
					<option value="">Select vendor…</option>
					{#each vendors as v (v.id)}<option value={String(v.id)}>{v.code} · {v.name}</option>{/each}
				</select>
			</Field>
		</div>
		<Field label="Order date" id="orderDate" error={fieldErrors.orderDate}>
			<input id="orderDate" type="date" class="input" bind:value={orderDate} />
		</Field>
		<Field label="Expected delivery" id="expectedDate" error={fieldErrors.expectedDate}>
			<input id="expectedDate" type="date" class="input" class:input-error={fieldErrors.expectedDate} min={orderDate} bind:value={expectedDate} />
		</Field>
		<div class="sm:col-span-2 lg:col-span-4">
			<Field label="Notes" id="notes" error={fieldErrors.notes}>
				<input id="notes" class="input" bind:value={notes} placeholder="Delivery instructions, quotation reference…" />
			</Field>
		</div>
	</div>

	<div class="card">
		<div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
			<h2 class="font-semibold text-slate-900">Items</h2>
			<button type="button" class="btn btn-secondary py-1.5" onclick={addLine}>+ Add line <kbd>Alt+A</kbd></button>
		</div>
		{#if fieldErrors.items}<p class="px-4 pt-3 text-sm text-red-600">{fieldErrors.items}</p>{/if}

		<!-- Desktop: grid table; mobile: stacked cards (same inputs) -->
		<div class="divide-y divide-slate-100">
			<div class="hidden grid-cols-12 gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 uppercase md:grid">
				<span class="col-span-5">Product</span><span class="col-span-2 text-right">Quantity</span>
				<span class="col-span-2 text-right">Unit price (₹)</span><span class="col-span-2 text-right">Line total</span><span></span>
			</div>
			{#each lines as line, i (line.uid)}
				{@const unit = productById.get(line.productId)?.unit}
				<div class="grid grid-cols-2 gap-3 px-4 py-3 md:grid-cols-12 md:items-start">
					<div class="col-span-2 md:col-span-5">
						<label class="label md:hidden" for="product-{i}">Product</label>
						<select id="product-{i}" class="input" class:input-error={fieldErrors[`items[${i}].productId`]} bind:value={line.productId} aria-label="Product line {i + 1}">
							<option value="">Select product…</option>
							{#each products as p (p.id)}
								<option value={String(p.id)} disabled={usedProducts.has(String(p.id)) && line.productId !== String(p.id)}>{p.sku} · {p.name}</option>
							{/each}
						</select>
						{#if fieldErrors[`items[${i}].productId`]}<p class="mt-1 text-xs text-red-600">{fieldErrors[`items[${i}].productId`]}</p>{/if}
					</div>
					<div class="md:col-span-2">
						<label class="label md:hidden" for="qty-{i}">Quantity {unit ? `(${unit})` : ''}</label>
						<input id="qty-{i}" class="input text-right" class:input-error={fieldErrors[`items[${i}].quantity`]} inputmode="decimal" placeholder={unit ?? 'Qty'} bind:value={line.quantity} aria-label="Quantity line {i + 1}" />
						{#if fieldErrors[`items[${i}].quantity`]}<p class="mt-1 text-xs text-red-600">{fieldErrors[`items[${i}].quantity`]}</p>{/if}
					</div>
					<div class="md:col-span-2">
						<label class="label md:hidden" for="price-{i}">Unit price (₹)</label>
						<input id="price-{i}" class="input text-right" class:input-error={fieldErrors[`items[${i}].unitPrice`]} inputmode="decimal" placeholder="0.00" bind:value={line.unitPrice} aria-label="Unit price line {i + 1}" />
						{#if fieldErrors[`items[${i}].unitPrice`]}<p class="mt-1 text-xs text-red-600">{fieldErrors[`items[${i}].unitPrice`]}</p>{/if}
					</div>
					<div class="flex items-center justify-between md:col-span-2 md:block md:pt-2 md:text-right">
						<span class="text-xs text-slate-500 md:hidden">Line total</span>
						<span class="font-medium tabular-nums">{formatMoney(previewLineTotal(line.quantity, line.unitPrice))}</span>
					</div>
					<div class="flex justify-end md:col-span-1 md:pt-1">
						<button type="button" class="btn btn-ghost px-2 py-1 text-red-600" disabled={lines.length === 1} onclick={() => removeLine(i)} aria-label="Remove line {i + 1}">✕</button>
					</div>
				</div>
			{/each}
		</div>
		<div class="flex items-center justify-end gap-6 border-t border-slate-200 bg-slate-50 px-4 py-3">
			<span class="text-sm text-slate-500">Estimated total</span>
			<span class="text-lg font-semibold tabular-nums">{formatMoney(grandTotal)}</span>
		</div>
	</div>

	{#if submitError && !Object.keys(fieldErrors).length}<ErrorBanner error={submitError} />{/if}

	<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
		<a href="/purchase-orders" class="btn btn-secondary">Cancel</a>
		<button class="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create purchase order'} <kbd class="border-indigo-400 bg-indigo-500 text-indigo-50">Ctrl+Enter</kbd></button>
	</div>
</form>
