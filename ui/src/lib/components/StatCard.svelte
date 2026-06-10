<script lang="ts" module>
	export type StatCardState = "loading" | "empty" | "error" | "populated";
</script>

<script lang="ts">
	import { cn } from "$lib/utils.js";
	import { Card } from "$lib/components/ui/card/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import CountBadge, { type CountBadgeTone } from "./CountBadge.svelte";
	import ErrorState from "./ErrorState.svelte";

	let {
		title,
		value = null,
		description,
		eyebrow,
		trendLabel,
		trendCount,
		trendTone = "neutral",
		state,
		errorMessage,
		emptyLabel = "No data yet",
		class: className,
	}: {
		title: string;
		value?: string | number | null;
		description?: string;
		eyebrow?: string;
		trendLabel?: string;
		trendCount?: number;
		trendTone?: CountBadgeTone;
		state?: StatCardState;
		errorMessage?: string;
		emptyLabel?: string;
		class?: string;
	} = $props();

	let resolvedState = $derived(
		state ?? (errorMessage ? "error" : value === null || value === undefined || value === "" ? "empty" : "populated"),
	);
	let displayValue = $derived(value === null || value === undefined || value === "" ? emptyLabel : String(value));
</script>

<Card data-slot="stat-card" class={cn("px-5", className)} aria-busy={resolvedState === "loading"}>
	{#if resolvedState === "loading"}
		<div class="flex items-start justify-between gap-4">
			<div class="space-y-2">
				<Skeleton class="h-3 w-20" />
				<Skeleton class="h-8 w-28" />
			</div>
			<Skeleton class="h-6 w-16 rounded-full" />
		</div>
		<Skeleton class="h-4 w-full max-w-48" />
	{:else if resolvedState === "error"}
		<ErrorState title={title} message={errorMessage ?? "The metric could not be loaded."} compact />
	{:else}
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0 space-y-1">
				{#if eyebrow}
					<p class="text-muted-foreground text-xs font-medium uppercase tracking-normal">{eyebrow}</p>
				{/if}
				<h3 class="text-muted-foreground text-sm font-medium">{title}</h3>
			</div>
			{#if trendLabel && trendCount !== undefined}
				<CountBadge count={trendCount} label={trendLabel} tone={trendTone} />
			{/if}
		</div>
		<div class="space-y-1">
			<p
				class={cn(
					"text-foreground font-mono text-3xl font-semibold tabular-nums leading-none",
					resolvedState === "empty" && "text-muted-foreground",
				)}
			>
				{displayValue}
			</p>
			{#if description}
				<p class="text-muted-foreground text-sm leading-5">{description}</p>
			{/if}
		</div>
	{/if}
</Card>
