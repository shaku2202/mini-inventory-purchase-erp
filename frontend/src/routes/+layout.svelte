<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import Toaster from '#lib/components/Toaster.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const nav = [
		{ href: '/', label: 'Inventory', key: '1', icon: '▤' },
		{ href: '/purchase-orders', label: 'Purchase Orders', key: '2', icon: '⧉' },
		{ href: '/purchase-orders/new', label: 'New Purchase Order', key: '3', icon: '+' },
		{ href: '/payments', label: 'Vendor Payments', key: '4', icon: '₹' },
		{ href: '/vendors', label: 'Vendors', key: '5', icon: '⌂' },
		{ href: '/products', label: 'Products', key: '6', icon: '◇' }
	];

	let menuOpen = $state(false);

	const isActive = (href: string) =>
		href === '/'
			? page.url.pathname === '/' || page.url.pathname.startsWith('/inventory')
			: href === '/purchase-orders'
				? page.url.pathname.startsWith('/purchase-orders') && page.url.pathname !== '/purchase-orders/new'
				: page.url.pathname === href;

	/**
	 * Global keyboard shortcuts:
	 *   Alt+1..6  jump to a module
	 *   /         focus the page search box
	 */
	function onKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

		if (event.altKey && !event.ctrlKey && !event.metaKey) {
			const item = nav.find((n) => n.key === event.key);
			if (item) {
				event.preventDefault();
				menuOpen = false;
				goto(item.href);
			}
			return;
		}
		if (event.key === '/' && !typing) {
			const search = document.querySelector<HTMLInputElement>('[data-search]');
			if (search) {
				event.preventDefault();
				search.focus();
			}
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Mini ERP · Inventory & Purchase</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="min-h-screen bg-slate-100 text-slate-800 lg:flex">
	<!-- Mobile top bar -->
	<div class="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3 text-white lg:hidden">
		<span class="font-semibold">Mini ERP</span>
		<button class="btn-ghost btn px-2 text-white hover:bg-slate-800" aria-label="Toggle menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>☰</button>
	</div>

	<aside
		class="{menuOpen ? 'block' : 'hidden'} z-20 w-full shrink-0 bg-slate-900 text-slate-300 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-60"
	>
		<div class="hidden px-5 py-5 lg:block">
			<p class="text-lg font-semibold text-white">Mini ERP</p>
			<p class="text-xs text-slate-400">Inventory & Purchase</p>
		</div>
		<nav class="flex flex-col gap-0.5 px-2 pb-4 lg:pb-0">
			{#each nav as item (item.href)}
				<a
					href={item.href}
					onclick={() => (menuOpen = false)}
					class="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition {isActive(item.href)
						? 'bg-indigo-600 text-white'
						: 'hover:bg-slate-800 hover:text-white'}"
					aria-current={isActive(item.href) ? 'page' : undefined}
				>
					<span class="w-4 text-center" aria-hidden="true">{item.icon}</span>
					<span class="flex-1">{item.label}</span>
					<kbd class="hidden border-slate-600 bg-slate-800 text-slate-400 lg:inline">Alt+{item.key}</kbd>
				</a>
			{/each}
		</nav>
		<p class="hidden px-5 pt-6 text-xs text-slate-500 lg:block">Press <kbd class="border-slate-600 bg-slate-800 text-slate-400">/</kbd> to search</p>
	</aside>

	<main class="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
		<div class="mx-auto max-w-6xl">
			{@render children()}
		</div>
	</main>
</div>

<Toaster />
