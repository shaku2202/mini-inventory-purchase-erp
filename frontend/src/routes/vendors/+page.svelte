<script lang="ts">
	import { ApiError } from '#lib/api/client.ts';
	import { vendorsApi } from '#lib/api/endpoints.ts';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import ErrorBanner from '#lib/components/ErrorBanner.svelte';
	import Field from '#lib/components/Field.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { toast } from '#lib/stores/toast.svelte.ts';
	import type { VendorBalance } from '#lib/types.ts';
	import { formatMoney } from '#lib/utils/format.ts';

	let balances = $state<VendorBalance[]>([]);
	let loading = $state(true);
	let loadError = $state<ApiError | null>(null);

	const emptyForm = () => ({ code: '', name: '', contactPerson: '', email: '', phone: '', gstin: '', address: '' });
	let form = $state(emptyForm());
	let fieldErrors = $state<Record<string, string>>({});
	let submitError = $state<ApiError | null>(null);
	let saving = $state(false);
	let showForm = $state(false);

	async function load() {
		loading = true;
		loadError = null;
		try {
			balances = (await vendorsApi.balances()).data;
		} catch (e) {
			loadError = e as ApiError;
		} finally {
			loading = false;
		}
	}
	load();

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		fieldErrors = {};
		submitError = null;
		try {
			const { data } = await vendorsApi.create(form);
			toast.success('Vendor created', `${data.code} · ${data.name}`);
			form = emptyForm();
			showForm = false;
			await load();
		} catch (e) {
			const err = e as ApiError;
			fieldErrors = err.fieldErrors;
			if (err.code === 'VENDOR_CODE_EXISTS') fieldErrors = { code: err.message };
			else submitError = err;
		} finally {
			saving = false;
		}
	}

	const totals = $derived(
		balances.reduce(
			(acc, b) => ({
				received: acc.received + Number(b.totalReceivedValue),
				paid: acc.paid + Number(b.totalPaid),
				outstanding: acc.outstanding + Number(b.outstandingBalance)
			}),
			{ received: 0, paid: 0, outstanding: 0 }
		)
	);
</script>

<PageHeader title="Vendors" subtitle="Payable = value of goods received − payments made (goods ordered but not received are not owed yet).">
	{#snippet actions()}
		<button class="btn btn-primary" onclick={() => (showForm = !showForm)}>{showForm ? 'Close' : '+ Add vendor'}</button>
	{/snippet}
</PageHeader>

{#if showForm}
	<form class="card mb-5 p-4 sm:p-5" onsubmit={submit} novalidate>
		<h2 class="mb-4 font-semibold text-slate-900">New vendor</h2>
		<ErrorBanner error={submitError} />
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<Field label="Vendor code" id="code" required error={fieldErrors.code} hint="Letters, digits, - or _">
				<input id="code" class="input uppercase" class:input-error={fieldErrors.code} bind:value={form.code} maxlength="30" required />
			</Field>
			<Field label="Name" id="name" required error={fieldErrors.name}>
				<input id="name" class="input" class:input-error={fieldErrors.name} bind:value={form.name} maxlength="150" required />
			</Field>
			<Field label="Contact person" id="contactPerson" error={fieldErrors.contactPerson}>
				<input id="contactPerson" class="input" bind:value={form.contactPerson} maxlength="100" />
			</Field>
			<Field label="Email" id="email" error={fieldErrors.email}>
				<input id="email" type="email" class="input" class:input-error={fieldErrors.email} bind:value={form.email} />
			</Field>
			<Field label="Phone" id="phone" error={fieldErrors.phone}>
				<input id="phone" class="input" class:input-error={fieldErrors.phone} bind:value={form.phone} />
			</Field>
			<Field label="GSTIN" id="gstin" error={fieldErrors.gstin}>
				<input id="gstin" class="input uppercase" class:input-error={fieldErrors.gstin} bind:value={form.gstin} maxlength="15" />
			</Field>
			<div class="sm:col-span-2 lg:col-span-3">
				<Field label="Address" id="address" error={fieldErrors.address}>
					<textarea id="address" class="input" rows="2" bind:value={form.address}></textarea>
				</Field>
			</div>
		</div>
		<div class="mt-4 flex justify-end gap-2">
			<button type="button" class="btn btn-secondary" onclick={() => (showForm = false)}>Cancel</button>
			<button class="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save vendor'}</button>
		</div>
	</form>
{/if}

<div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
	<div class="card p-4"><p class="label">Received value</p><p class="text-xl font-semibold tabular-nums">{formatMoney(totals.received)}</p></div>
	<div class="card p-4"><p class="label">Paid</p><p class="text-xl font-semibold text-emerald-700 tabular-nums">{formatMoney(totals.paid)}</p></div>
	<div class="card p-4"><p class="label">Total outstanding</p><p class="text-xl font-semibold text-amber-700 tabular-nums">{formatMoney(totals.outstanding)}</p></div>
</div>

<ErrorBanner error={loadError} onretry={load} />

<div class="card">
	{#if loading && balances.length === 0}
		<Spinner />
	{:else if balances.length === 0 && !loadError}
		<EmptyState title="No vendors yet">Add your first vendor to start purchasing.</EmptyState>
	{:else}
		<div class="overflow-x-auto">
			<table class="table-erp">
				<thead>
					<tr>
						<th>Code</th><th>Vendor</th><th class="num">POs</th><th class="num">Ordered</th><th class="num">Received (payable)</th>
						<th class="num">Paid</th><th class="num">Outstanding</th><th></th>
					</tr>
				</thead>
				<tbody>
					{#each balances as b (b.vendorId)}
						<tr>
							<td class="font-mono text-xs">{b.vendorCode}</td>
							<td class="font-medium text-slate-900">{b.vendorName}</td>
							<td class="num">{b.purchaseOrderCount}</td>
							<td class="num text-slate-500">{formatMoney(b.totalOrderedValue)}</td>
							<td class="num">{formatMoney(b.totalReceivedValue)}</td>
							<td class="num text-emerald-700">{formatMoney(b.totalPaid)}</td>
							<td class="num font-semibold {Number(b.outstandingBalance) > 0 ? 'text-amber-700' : 'text-slate-400'}">{formatMoney(b.outstandingBalance)}</td>
							<td class="text-right whitespace-nowrap">
								{#if Number(b.outstandingBalance) > 0}
									<a class="text-xs font-medium text-indigo-600 hover:underline" href="/payments?vendorId={b.vendorId}">Pay →</a>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
