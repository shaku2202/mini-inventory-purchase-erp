<script lang="ts">
	import { ApiError } from '#lib/api/client.ts';
	import { paymentsApi, purchaseOrdersApi, vendorsApi } from '#lib/api/endpoints.ts';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import Field from '#lib/components/Field.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { toast } from '#lib/stores/toast.svelte.ts';
	import { PAYMENT_METHODS, type PaymentMethod, type PurchaseOrder, type VendorBalance, type VendorPayment } from '#lib/types.ts';
	import { formatDate, formatMoney, humanize, newIdempotencyKey, today } from '#lib/utils/format.ts';
	import { page } from '$app/state';

	let balances = $state<VendorBalance[]>([]);
	let payments = $state<VendorPayment[]>([]);
	let vendorPos = $state<PurchaseOrder[]>([]);
	let poOutstanding = $state<string | null>(null);
	let loading = $state(true);
	let loadError = $state<ApiError | null>(null);

	// Prefill from links such as /payments?vendorId=1&purchaseOrderId=3
	let vendorId = $state(page.url.searchParams.get('vendorId') ?? '');
	let purchaseOrderId = $state(page.url.searchParams.get('purchaseOrderId') ?? '');
	let amount = $state('');
	let paymentMethod = $state<PaymentMethod>('BANK_TRANSFER');
	let paymentDate = $state(today());
	let referenceNo = $state('');
	let notes = $state('');

	let fieldErrors = $state<Record<string, string>>({});
	let submitError = $state<ApiError | null>(null);
	let saving = $state(false);
	/** Reused on retry so a payment can never be booked twice (see goods receipt page). */
	let idempotencyKey = $state(newIdempotencyKey('pay'));

	const selectedVendor = $derived(balances.find((b) => String(b.vendorId) === vendorId) ?? null);
	const maxPayable = $derived(purchaseOrderId && poOutstanding !== null ? poOutstanding : (selectedVendor?.outstandingBalance ?? null));

	async function loadBalances() {
		balances = (await vendorsApi.balances()).data;
	}

	async function loadPayments() {
		payments = (await paymentsApi.list({ vendorId: vendorId ? Number(vendorId) : undefined })).data;
	}

	// Payment history is (re)loaded by the vendor effect below.
	async function load() {
		loading = true;
		loadError = null;
		try {
			await loadBalances();
		} catch (e) {
			loadError = e as ApiError;
		} finally {
			loading = false;
		}
	}
	load();

	// When the vendor changes: refresh history and that vendor's received POs.
	$effect(() => {
		const id = vendorId;
		vendorPos = [];
		loadPayments().catch((e) => (loadError = e));
		if (!id) return;
		purchaseOrdersApi
			.list({ vendorId: Number(id), limit: 100 })
			.then((res) => (vendorPos = res.data.filter((po) => po.status !== 'OPEN')))
			.catch((e) => (loadError = e));
	});

	async function refreshPoOutstanding(id: string) {
		if (!id) {
			poOutstanding = null;
			return;
		}
		try {
			poOutstanding = (await purchaseOrdersApi.get(Number(id))).data.outstandingAmount;
		} catch {
			poOutstanding = null;
		}
	}

	// When a PO is chosen: fetch what is still owed on it.
	$effect(() => {
		refreshPoOutstanding(purchaseOrderId);
	});

	function onVendorChange() {
		purchaseOrderId = '';
		fieldErrors = {};
		submitError = null;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		saving = true;
		fieldErrors = {};
		submitError = null;
		try {
			const res = await paymentsApi.create(
				{
					vendorId: vendorId ? Number(vendorId) : undefined,
					purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : null,
					amount,
					paymentMethod,
					paymentDate: paymentDate || undefined,
					referenceNo: referenceNo || undefined,
					notes: notes || undefined
				},
				idempotencyKey
			);
			const { payment, vendorBalance } = res.data;
			if (res.replayed) {
				toast.info(`${payment.paymentNumber} was already recorded`, 'The earlier request had succeeded - no duplicate payment was created.');
			} else {
				toast.success(`Payment ${payment.paymentNumber} recorded`, `${formatMoney(payment.amount)} · outstanding now ${formatMoney(vendorBalance.outstandingBalance)}`);
			}
			idempotencyKey = newIdempotencyKey('pay');
			amount = '';
			referenceNo = '';
			notes = '';
			await Promise.all([loadBalances(), loadPayments(), refreshPoOutstanding(purchaseOrderId)]);
		} catch (e) {
			const err = e as ApiError;
			fieldErrors = err.fieldErrors;
			if (['PAYMENT_EXCEEDS_OUTSTANDING', 'PAYMENT_EXCEEDS_PO_OUTSTANDING', 'PAYMENT_NO_OUTSTANDING'].includes(err.code)) {
				fieldErrors = { amount: err.message };
			}
			submitError = err;
			toast.error('Payment not recorded', err.message);
			if (err.code === 'IDEMPOTENCY_KEY_REUSED') idempotencyKey = newIdempotencyKey('pay');
		} finally {
			saving = false;
		}
	}
</script>

<PageHeader title="Vendor payments" subtitle="Payments reduce the vendor's outstanding payable. Advance payments / overpayments are not allowed." />

<ErrorBanner error={loadError} onretry={load} />

<div class="grid grid-cols-1 gap-5 lg:grid-cols-5">
	<form class="card p-4 sm:p-5 lg:col-span-2" onsubmit={submit} novalidate>
		<h2 class="mb-4 font-semibold text-slate-900">Record payment</h2>
		<div class="space-y-4">
			<Field label="Vendor" id="vendorId" required error={fieldErrors.vendorId}>
				<select id="vendorId" class="input" class:input-error={fieldErrors.vendorId} bind:value={vendorId} onchange={onVendorChange}>
					<option value="">Select vendor…</option>
					{#each balances as b (b.vendorId)}
						<option value={String(b.vendorId)}>{b.vendorCode} · {b.vendorName} — owes {formatMoney(b.outstandingBalance)}</option>
					{/each}
				</select>
			</Field>

			{#if selectedVendor}
				<div class="grid grid-cols-3 gap-2 rounded-md bg-slate-50 p-3 text-center text-xs">
					<div><p class="text-slate-500">Received</p><p class="font-semibold tabular-nums">{formatMoney(selectedVendor.totalReceivedValue)}</p></div>
					<div><p class="text-slate-500">Paid</p><p class="font-semibold text-emerald-700 tabular-nums">{formatMoney(selectedVendor.totalPaid)}</p></div>
					<div><p class="text-slate-500">Outstanding</p><p class="font-semibold text-amber-700 tabular-nums">{formatMoney(selectedVendor.outstandingBalance)}</p></div>
				</div>
			{/if}

			<Field label="Allocate to purchase order" id="purchaseOrderId" error={fieldErrors.purchaseOrderId} hint="Optional - leave empty for an on-account payment">
				<select id="purchaseOrderId" class="input" bind:value={purchaseOrderId} disabled={!vendorId}>
					<option value="">On account (no specific PO)</option>
					{#each vendorPos as po (po.id)}<option value={String(po.id)}>{po.poNumber} · {formatMoney(po.totalAmount)}</option>{/each}
				</select>
			</Field>

			<Field label="Amount (₹)" id="amount" required error={fieldErrors.amount} hint={maxPayable !== null ? `Maximum payable: ${formatMoney(maxPayable)}` : undefined}>
				<div class="flex gap-2">
					<input id="amount" class="input text-right" class:input-error={fieldErrors.amount} inputmode="decimal" placeholder="0.00" bind:value={amount} />
					{#if maxPayable !== null && Number(maxPayable) > 0}
						<button type="button" class="btn btn-secondary shrink-0 px-2.5" onclick={() => (amount = maxPayable ?? '')}>Full</button>
					{/if}
				</div>
			</Field>

			<div class="grid grid-cols-2 gap-3">
				<Field label="Method" id="paymentMethod" required error={fieldErrors.paymentMethod}>
					<select id="paymentMethod" class="input" bind:value={paymentMethod}>
						{#each PAYMENT_METHODS as m (m)}<option value={m}>{humanize(m)}</option>{/each}
					</select>
				</Field>
				<Field label="Date" id="paymentDate" error={fieldErrors.paymentDate}>
					<input id="paymentDate" type="date" class="input" bind:value={paymentDate} max={today()} />
				</Field>
			</div>
			<Field label="Reference no." id="referenceNo" error={fieldErrors.referenceNo} hint="UTR / cheque number">
				<input id="referenceNo" class="input" bind:value={referenceNo} maxlength="50" />
			</Field>
			<Field label="Notes" id="notes" error={fieldErrors.notes}>
				<input id="notes" class="input" bind:value={notes} />
			</Field>

			{#if submitError && !Object.keys(fieldErrors).length}<ErrorBanner error={submitError} />{/if}

			<button class="btn btn-primary w-full" disabled={saving}>{saving ? 'Recording…' : 'Record payment'}</button>
		</div>
	</form>

	<section class="card lg:col-span-3">
		<h2 class="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">
			Payment history {#if selectedVendor}<span class="font-normal text-slate-500">· {selectedVendor.vendorName}</span>{/if}
		</h2>
		{#if loading && payments.length === 0}
			<Spinner />
		{:else if payments.length === 0}
			<EmptyState title="No payments yet" />
		{:else}
			<div class="overflow-x-auto">
				<table class="table-erp">
					<thead><tr><th>Payment</th><th>Date</th><th>Vendor</th><th>PO</th><th>Method</th><th class="num">Amount</th></tr></thead>
					<tbody>
						{#each payments as p (p.id)}
							<tr>
								<td class="font-mono text-xs">{p.paymentNumber}</td>
								<td class="whitespace-nowrap">{formatDate(p.paymentDate)}</td>
								<td>{p.vendorName}</td>
								<td class="font-mono text-xs">{#if p.purchaseOrderId}<a class="text-indigo-600 hover:underline" href="/purchase-orders/{p.purchaseOrderId}">{p.poNumber}</a>{:else}<span class="text-slate-400">On account</span>{/if}</td>
								<td class="text-xs">{humanize(p.paymentMethod)}{#if p.referenceNo}<br /><span class="text-slate-500">{p.referenceNo}</span>{/if}</td>
								<td class="num font-medium">{formatMoney(p.amount)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>
