<script lang="ts" module>
	export type TimelineState = "loading" | "empty" | "error" | "populated";
	export type TimelineItemStatus = "complete" | "current" | "pending" | "warning" | "error";

	export type TimelineItem = {
		id: string;
		title: string;
		description?: string;
		timestamp?: string | number | Date;
		status?: TimelineItemStatus;
		meta?: string;
		href?: string;
	};
</script>

<script lang="ts">
	import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
	import CheckIcon from "@lucide/svelte/icons/check";
	import CircleIcon from "@lucide/svelte/icons/circle";
	import ClockIcon from "@lucide/svelte/icons/clock";
	import XIcon from "@lucide/svelte/icons/x";
	import { cn } from "$lib/utils.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import EmptyState from "./EmptyState.svelte";
	import ErrorState from "./ErrorState.svelte";

	let {
		items = [],
		selectedId,
		state,
		title,
		emptyTitle = "No timeline events",
		emptyDescription = "Progress events will appear here as work advances.",
		errorTitle = "Timeline unavailable",
		errorMessage = "Timeline events could not be loaded.",
		onSelect,
		class: className,
	}: {
		items?: TimelineItem[];
		selectedId?: string;
		state?: TimelineState;
		title?: string;
		emptyTitle?: string;
		emptyDescription?: string;
		errorTitle?: string;
		errorMessage?: string;
		onSelect?: (item: TimelineItem) => void;
		class?: string;
	} = $props();

	let resolvedState = $derived(state ?? (items.length > 0 ? "populated" : "empty"));

	function formatTime(timestamp: TimelineItem["timestamp"]): string {
		if (!timestamp) return "";
		const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
		if (Number.isNaN(date.getTime())) return String(timestamp);
		return date.toLocaleString([], {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	function statusClasses(status: TimelineItemStatus | undefined, selected: boolean): string {
		if (selected) return "border-primary bg-primary text-primary-foreground";
		if (status === "complete") return "border-ok bg-ok text-primary-foreground";
		if (status === "current") return "border-primary bg-primary text-primary-foreground";
		if (status === "warning") return "border-watch bg-watch text-primary-foreground";
		if (status === "error") return "border-destructive bg-destructive text-destructive-foreground";
		return "border-border bg-background text-muted-foreground";
	}

	function select(item: TimelineItem) {
		onSelect?.(item);
	}
</script>

<section data-slot="timeline" class={cn("rounded-lg border bg-card text-card-foreground", className)} aria-busy={resolvedState === "loading"}>
	{#if title}
		<header class="border-b px-4 py-3">
			<h3 class="text-sm font-semibold text-foreground">{title}</h3>
		</header>
	{/if}
	{#if resolvedState === "loading"}
		<div class="space-y-4 p-4">
			{#each Array.from({ length: 3 }) as _, index (index)}
				<div class="flex gap-3">
					<Skeleton class="mt-1 size-6 rounded-full" aria-label={index === 0 ? "Loading timeline" : undefined} />
					<div class="flex-1 space-y-2">
						<Skeleton class="h-4 w-40" />
						<Skeleton class="h-3 w-64 max-w-full" />
					</div>
				</div>
			{/each}
		</div>
	{:else if resolvedState === "error"}
		<div class="p-4">
			<ErrorState title={errorTitle} message={errorMessage} compact />
		</div>
	{:else if resolvedState === "empty"}
		<div class="p-4">
			<EmptyState title={emptyTitle} description={emptyDescription} icon="inbox" tone="neutral" />
		</div>
	{:else}
		<ol class="divide-y">
			{#each items as item, index (item.id)}
				{@const selected = item.id === selectedId}
				{@const status = item.status ?? (selected ? "current" : "pending")}
				<li class="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 px-4 py-3">
					<div class="flex flex-col items-center">
						<span class={cn("z-10 flex size-7 items-center justify-center rounded-full border text-xs", statusClasses(status, selected))}>
							{#if status === "complete"}
								<CheckIcon class="size-3.5" aria-hidden="true" />
							{:else if status === "warning"}
								<AlertTriangleIcon class="size-3.5" aria-hidden="true" />
							{:else if status === "error"}
								<XIcon class="size-3.5" aria-hidden="true" />
							{:else if status === "current"}
								<ClockIcon class="size-3.5" aria-hidden="true" />
							{:else}
								<CircleIcon class="size-3" aria-hidden="true" />
							{/if}
						</span>
						{#if index < items.length - 1}
							<span class="mt-2 h-full min-h-8 w-px bg-border" aria-hidden="true"></span>
						{/if}
					</div>
					<div class="min-w-0">
						{#if item.href}
							<Button variant="link" href={item.href} class="h-auto max-w-full justify-start p-0 text-left">
								<span class="truncate">{item.title}</span>
							</Button>
						{:else if onSelect}
							<button type="button" class="max-w-full text-left text-sm font-medium text-foreground hover:text-primary" onclick={() => select(item)}>
								<span class="truncate">{item.title}</span>
							</button>
						{:else}
							<h4 class="truncate text-sm font-medium text-foreground">{item.title}</h4>
						{/if}
						{#if item.description}
							<p class="mt-1 text-sm leading-5 text-muted-foreground">{item.description}</p>
						{/if}
						<div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
							{#if item.timestamp}
								<span>{formatTime(item.timestamp)}</span>
							{/if}
							{#if item.meta}
								<span>{item.meta}</span>
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>
