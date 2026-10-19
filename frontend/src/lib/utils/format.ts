const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
const qty = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

export const formatMoney = (value: string | number | null | undefined) => money.format(Number(value ?? 0));

export const formatQty = (value: string | number | null | undefined, unit?: string) =>
	`${qty.format(Number(value ?? 0))}${unit ? ` ${unit}` : ''}`;

export const formatDate = (value: string | null | undefined) =>
	value ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const formatDateTime = (value: string | null | undefined) =>
	value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const humanize = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

/** One key per user action; reused on retry so the server can de-duplicate. */
export const newIdempotencyKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

/**
 * Preview-only line total for the PO form (rounded like the database does).
 * The authoritative total is always the one returned by the API.
 */
export function previewLineTotal(quantity: string, unitPrice: string): number {
	const q = Number(quantity);
	const p = Number(unitPrice);
	if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
	return Math.round(q * p * 100) / 100;
}
