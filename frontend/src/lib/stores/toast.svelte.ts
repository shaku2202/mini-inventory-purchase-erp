export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
	id: number;
	kind: ToastKind;
	title: string;
	message?: string;
}

let nextId = 1;

/** Global transaction-status notifications (Svelte 5 runes store). */
class ToastStore {
	items = $state<Toast[]>([]);

	push(kind: ToastKind, title: string, message?: string, timeoutMs = kind === 'error' ? 8000 : 4500) {
		const id = nextId++;
		this.items.push({ id, kind, title, message });
		setTimeout(() => this.dismiss(id), timeoutMs);
	}

	success = (title: string, message?: string) => this.push('success', title, message);
	error = (title: string, message?: string) => this.push('error', title, message);
	info = (title: string, message?: string) => this.push('info', title, message);

	dismiss(id: number) {
		this.items = this.items.filter((t) => t.id !== id);
	}
}

export const toast = new ToastStore();
