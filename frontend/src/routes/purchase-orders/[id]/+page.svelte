<script lang="ts">
	import { ApiError } from '#lib/api/client.ts';
	import { goodsReceiptsApi, paymentsApi, purchaseOrdersApi } from '#lib/api/endpoints.ts';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { toast } from '#lib/stores/toast.svelte.ts';
	import type { GoodsReceipt, PurchaseOrderDetail, VendorPayment } from '#lib/types.ts';
	import { formatDate, formatMoney, formatQty, newIdempotencyKey, today } from '#lib/utils/format.ts';
	import { page } from '$app/state';

	const poId = $derived(Number(page.params.id));

	let po = $state<PurchaseOrderDetail | null>(null);
	let receipts = $state<GoodsReceipt[]>([]);
	let payments = $state<VendorPayment[]>([]);
	let loading = $state(true);
	let loadError = $state<ApiError | null>(null);

	// ---- receive goods form ----
	let receiveQty = $state<Record<number, string>>({});
	let receivedDate = $state(today());
	let receiveNotes = $state('');
	let fieldErrors = $state<Record<string, string>>({});
	let receiveError = $state<ApiError | null>(null);
	let receiving = $state(false);
	/**
	 * One key per receipt attempt. It is kept when a request fails (network
	 * error, timeout) so pressing "Receive" again is a safe retry, and only
	 * renewed after a confirmed success.
	 */
	let idempotencyKey = $state(newIdempotencyKey('grn'));

	async function load() {
		loading = true;
		loadError = null;
		try {
			const [poRes, grRes] = await Promise.all([purchaseOrdersApi.get(poId), goodsReceiptsApi.list({ purchaseOrderId: poId })]);
			po = poRes.data;
			receipts = grRes.data;
			payments = (await paymentsApi.list({ vendorId: po.vendorId })).data.filter((p) => p.purchaseOrderId === poId);
		} catch (e) {
			loadError = e as ApiError;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void poId;
		load();
	});

	const pendingItems = $derived(po?.items.filter((i) => Number(i.pendingQuantity) > 0) ?? []);
	const receivingLines = $derived(
		pendingItems
			.map((item, index) => ({ item, index, quantity: (receiveQty[item.id] ?? '').trim() }))
			.filter((l) => l.quantity !== '')
	);

	function fillAllPending() {
		for (const item of pendingItems) receiveQty[item.id] = String(Number(item.pendingQuantity));
	}

	async function receive(event: SubmitEvent) {
		event.preventDefault();
		if (!po || receiving) return;
		fieldErrors = {};
		receiveError = null;
		if (receivingLines.length === 0) {
			fieldErrors = { form: 'Enter a quantity for at least one item.' };
			return;
		}

		receiving = true;
		try {
			const res = await goodsReceiptsApi.create(
				{
					purchaseOrderId: po.id,
					receivedDate: receivedDate || undefined,
					notes: receiveNotes || undefined,
					items: receivingLines.map((l) => ({ purchaseOrderItemId: l.item.id, quantity: l.quantity }))
				},
				idempotencyKey
			);
			if (res.replayed) {
				toast.info(`${res.data.grnNumber} was already recorded`, 'The earlier request had succeeded - stock was not added twice.');
			} else {
				toast.success(`Goods receipt ${res.data.grnNumber} posted`, `Stock updated · value ${formatMoney(res.data.totalValue)}`);
			}
			idempotencyKey = newIdempotencyKey('grn');
			receiveQty = {};
			receiveNotes = '';
			await load();
		} catch (e) {
			const err = e as ApiError;
			// Map "items[0].quantity" (index in the submitted array) back to the PO line.
			const mapped: Record<string, string> = {};
			for (const [field, message] of Object.entries(err.fieldErrors)) {
				const match = field.match(/^items\[(\d+)\]/);
				const line = match ? receivingLines[Number(match[1])] : undefined;
				mapped[line ? `item-${line.item.id}` : field] = message;
			}
			fieldErrors = mapped;
			receiveError = err;
			toast.error('Goods receipt failed', err.message);
			// Rejected requests store nothing under the key, so it stays valid for the retry.
			// Only a key already bound to a different payload must be replaced.
			if (err.code === 'IDEMPOTENCY_KEY_REUSED') idempotencyKey = newIdempotencyKey('grn');
		} finally {
			receiving = false;
		}
	}
</script>

<a href="/purchase-orders" class="mb-3 inline-block text-sm text-indigo-600 hover:underline">← Purchase orders</a>

<ErrorBanner error={loadError} onretry={load} />

{#if loading && !po}
	<Spinner />
{:else if po}
	<PageHeader title={po.poNumber} subtitle="{po.vendorCode} · {po.vendorName}">
		{#snippet actions()}
			<StatusBadge status={po!.status} />
			{#if Number(po!.outstandingAmount) > 0}
				<a class="btn btn-secondary" href="/payments?vendorId={po!.vendorId}&purchaseOrderId={po!.id}">Record payment</a>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
		<div class="card p-4"><p class="label">Order value</p><p class="text-lg font-semibold tabular-nums">{formatMoney(po.totalAmount)}</p></div>
		<div class="card p-4"><p class="label">Received value</p><p class="text-lg font-semibold tabular-nums">{formatMoney(po.receivedValue)}</p></div>
		<div class="card p-4"><p class="label">Paid on this PO</p><p class="text-lg font-semibold text-emerald-700 tabular-nums">{formatMoney(po.paidAmount)}</p></div>
		<div class="card p-4"><p class="label">PO outstanding</p><p class="text-lg font-semibold text-amber-700 tabular-nums">{formatMoney(po.outstandingAmount)}</p></div>
	</div>

	<div class="mb-5 text-sm text-slate-600">
		Ordered {formatDate(po.orderDate)}{#if po.expectedDate}{' · '}expected {formatDate(po.expectedDate)}{/if}{#if po.notes}{' · '}{po.notes}{/if}
	</div>

	<form class="card mb-5" onsubmit={receive} novalidate>
		<div class="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
			<h2 class="font-semibold text-slate-900">Items {#if pendingItems.length}&amp; goods receipt{/if}</h2>
			{#if pendingItems.length}
				<button type="button" class="btn btn-secondary py-1.5" onclick={fillAllPending}>Fill all pending</button>
			{/if}
		</div>

		<div class="overflow-x-auto">
			<table class="table-erp">
				<thead>
					<tr>
						<th>Product</th><th class="num">Ordered</th><th class="num">Unit price</th><th class="num">Line total</th>
						<th class="num">Received</th><th class="num">Pending</th>
						{#if pendingItems.length}<th class="num">Receive now</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each po.items as item (item.id)}
						{@const pending = Number(item.pendingQuantity) > 0}
						<tr>
							<td><p class="font-medium text-slate-900">{item.productName}</p><p class="font-mono text-xs text-slate-500">{item.productSku}</p></td>
							<td class="num whitespace-nowrap">{formatQty(item.quantity, item.unit)}</td>
							<td class="num">{formatMoney(item.unitPrice)}</td>
							<td class="num">{formatMoney(item.lineTotal)}</td>
							<td class="num text-emerald-700">{formatQty(item.receivedQuantity)}</td>
							<td class="num {pending ? 'font-semibold text-amber-700' : 'text-slate-400'}">{formatQty(item.pendingQuantity)}</td>
							{#if pendingItems.length}
								<td class="num min-w-36">
									{#if pending}
										<input
											class="input text-right"
											class:input-error={fieldErrors[`item-${item.id}`]}
											inputmode="decimal"
											placeholder="0"
											aria-label="Receive quantity for {item.productName}"
											bind:value={receiveQty[item.id]}
										/>
										{#if fieldErrors[`item-${item.id}`]}<p class="mt-1 text-left text-xs text-red-600">{fieldErrors[`item-${item.id}`]}</p>{/if}
									{:else}
										<span class="text-xs text-emerald-700">Complete</span>
									{/if}
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if pendingItems.length}
			<div class="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-4 sm:items-end">
				<div>
					<label class="label" for="receivedDate">Received date</label>
					<input id="receivedDate" type="date" class="input" bind:value={receivedDate} max={today()} />
				</div>
				<div class="sm:col-span-2">
					<label class="label" for="receiveNotes">Notes / challan no.</label>
					<input id="receiveNotes" class="input" bind:value={receiveNotes} />
				</div>
				<button class="btn btn-primary" disabled={receiving}>{receiving ? 'Posting…' : 'Receive goods'}</button>
			</div>
			<div class="px-4 pb-4">
				{#if fieldErrors.form}<p class="text-sm text-red-600">{fieldErrors.form}</p>{/if}
				<ErrorBanner error={receiveError} />
			</div>
		{:else}
			<p class="border-t border-slate-200 px-4 py-3 text-sm text-emerald-700">All items have been received.</p>
		{/if}
	</form>

	<div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
		<section class="card">
			<h2 class="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">Goods receipts</h2>
			{#if receipts.length === 0}
				<p class="px-4 py-6 text-sm text-slate-500">Nothing received yet.</p>
			{:else}
				<table class="table-erp">
					<thead><tr><th>GRN</th><th>Date</th><th class="num">Value</th></tr></thead>
					<tbody>
						{#each receipts as r (r.id)}
							<tr><td class="font-mono text-xs">{r.grnNumber}</td><td>{formatDate(r.receivedDate)}</td><td class="num">{formatMoney(r.totalValue)}</td></tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
		<section class="card">
			<h2 class="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">Payments allocated to this PO</h2>
			{#if payments.length === 0}
				<p class="px-4 py-6 text-sm text-slate-500">No payments allocated to this PO.</p>
			{:else}
				<table class="table-erp">
					<thead><tr><th>Payment</th><th>Date</th><th class="num">Amount</th></tr></thead>
					<tbody>
						{#each payments as p (p.id)}
							<tr><td class="font-mono text-xs">{p.paymentNumber}</td><td>{formatDate(p.paymentDate)}</td><td class="num">{formatMoney(p.amount)}</td></tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	</div>
{/if}
