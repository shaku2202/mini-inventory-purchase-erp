const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/api';

export interface FieldError {
	field: string;
	code: string;
	message: string;
}

/** Error thrown for every failed call - mirrors the API error envelope. */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly details?: unknown,
		readonly requestId?: string
	) {
		super(message);
	}

	/** Field level validation errors keyed by field path, e.g. `items[0].quantity`. */
	get fieldErrors(): Record<string, string> {
		if (!Array.isArray(this.details)) return {};
		return Object.fromEntries((this.details as FieldError[]).map((d) => [d.field, d.message]));
	}

	/** Network failure / timeout: the request may or may not have reached the server. */
	get isNetworkError(): boolean {
		return this.status === 0;
	}
}

interface RequestOptions {
	method?: 'GET' | 'POST';
	body?: unknown;
	query?: Record<string, string | number | boolean | undefined | null>;
	/** Sent as Idempotency-Key - reuse the same key when retrying the same action. */
	idempotencyKey?: string;
	timeoutMs?: number;
}

export interface ApiResponse<T, M = unknown> {
	data: T;
	meta: M;
	replayed: boolean;
}

export async function request<T, M = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T, M>> {
	const url = new URL(API_URL + path);
	for (const [key, value] of Object.entries(options.query ?? {})) {
		if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
	}

	const headers: Record<string, string> = { Accept: 'application/json' };
	if (options.body !== undefined) headers['Content-Type'] = 'application/json';
	if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

	let response: Response;
	try {
		response = await fetch(url, {
			method: options.method ?? 'GET',
			headers,
			body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
			signal: AbortSignal.timeout(options.timeoutMs ?? 15_000)
		});
	} catch {
		throw new ApiError(
			0,
			'NETWORK_ERROR',
			'Could not reach the server. Check your connection and retry - a retry will not create a duplicate.'
		);
	}

	const payload = await response.json().catch(() => null);
	if (!response.ok || !payload?.success) {
		const error = payload?.error;
		throw new ApiError(
			response.status,
			error?.code ?? 'UNKNOWN_ERROR',
			error?.message ?? `Request failed with status ${response.status}`,
			error?.details,
			error?.requestId
		);
	}

	return {
		data: payload.data as T,
		meta: payload.meta as M,
		replayed: response.headers.get('Idempotent-Replayed') === 'true'
	};
}
