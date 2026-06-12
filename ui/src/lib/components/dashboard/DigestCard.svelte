<script lang="ts" module>
	export type DigestCardState = "idle" | "loading" | "ready" | "error";
</script>

<script lang="ts">
	import CheckCircle2Icon from "@lucide/svelte/icons/check-circle-2";
	import CircleDollarSignIcon from "@lucide/svelte/icons/circle-dollar-sign";
	import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
	import FileCheck2Icon from "@lucide/svelte/icons/file-check-2";
	import type { Component } from "svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { cn } from "$lib/utils.js";
	import CountBadge from "$lib/components/CountBadge.svelte";
	import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
	import { aggregateDigest, digestHasActivity, type DigestEvent, type DigestSummary, type DigestUsagePayload } from "./digest";

	let {
		events = [],
		usage = null,
		state = "idle",
		error = null,
		lastSeenMs = Date.now() - 24 * 60 * 60_000,
		onRetry,
		class: className,
	}: {
		events?: DigestEvent[];
		usage?: DigestUsagePayload | null;
		state?: DigestCardState;
		error?: unknown;
		lastSeenMs?: number;
		onRetry?: () => void;
		class?: string;
	} = $props();

	let summary = $derived(aggregateDigest(events, usage, lastSeenMs));
	let isLoading = $derived(state === "idle" || state === "loading");
	let hasActivity = $derived(digestHasActivity(summary));
	let totalSignals = $derived(summary.tasksClosed + summary.resultsAwaitingReview + summary.ordersExecuted);
	let dataState = $derived(
		(isLoading ? "loading" : state === "error" ? "error" : hasActivity ? "populated" : "empty") as DataStateKind,
	);
	let sinceLabel = $derived(formatSince(summary.sinceMs));

	type Metric = {
		label: string;
		value: string;
		description: string;
		tone: "ok" | "watch" | "primary" | "neutral";
		icon: Component;
	};

	let metrics = $derived(metricRows(summary));

	function metricRows(value: DigestSummary): Metric[] {
		return [
			{
				label: "Tasks closed",
				value: formatInteger(value.tasksClosed),
				description: value.tasksClosed === 1 ? "1 task reached a closed state." : "Tasks that reached a closed state.",
				tone: value.tasksClosed ? "ok" : "neutral",
				icon: CheckCircle2Icon,
			},
			{
				label: "Results awaiting review",
				value: formatInteger(value.resultsAwaitingReview),
				description:
					value.resultsAwaitingReview === 1
						? "1 result is waiting for review."
						: "Results that moved into review.",
				tone: value.resultsAwaitingReview ? "watch" : "neutral",
				icon: FileCheck2Icon,
			},
			{
				label: "Orders executed",
				value: formatInteger(value.ordersExecuted),
				description: value.ordersExecuted === 1 ? "1 order executed." : "Orders that completed execution.",
				tone: value.ordersExecuted ? "primary" : "neutral",
				icon: ClipboardCheckIcon,
			},
			{
				label: "Spend",
				value: formatCost(value.spendUsd),
				description: value.spendUsd === null ? "Usage spend is not reported yet." : "Usage spend from the Hub ledger.",
				tone: value.spendUsd && value.spendUsd > 0 ? "primary" : "neutral",
				icon: CircleDollarSignIcon,
			},
		];
	}

	function formatInteger(value: number): string {
		return new Intl.NumberFormat().format(Math.max(0, value));
	}

	function formatCost(value: number | null): string {
		if (value === null) return "Not reported";
		if (value === 0) return "$0.0000";
		if (value < 0.01) return `$${value.toFixed(4)}`;
		return `$${value.toFixed(2)}`;
	}

	function formatSince(value: number): string {
		if (!value) return "Since last visit";
		return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(
			new Date(value),
		);
	}

	function toneClass(tone: Metric["tone"]): string {
		if (tone === "ok") return "border-ok/20 bg-ok/5 text-ok";
		if (tone === "watch") return "border-watch/20 bg-watch/5 text-watch";
		if (tone === "primary") return "border-primary/20 bg-primary/5 text-primary";
		return "border-border bg-background text-foreground";
	}
</script>

<section data-slot="digest-card" class={cn("min-w-0 space-y-3 rounded-lg border bg-card p-4", className)} aria-label="While you were away">
	<div class="flex items-center justify-between gap-2">
		<div class="min-w-0">
			<div class="flex items-center gap-2">
				<h2 class="text-base font-semibold">While you were away</h2>
				<CountBadge count={totalSignals} label="signals" tone={totalSignals ? "primary" : "neutral"} loading={isLoading} />
			</div>
			<p class="mt-1 truncate text-xs text-muted-foreground">{sinceLabel}</p>
		</div>
		<Button variant="ghost" size="sm" href="/work/activity">Open events</Button>
	</div>

	<DataState
		state={dataState}
		{error}
		emptyTitle="All quiet"
		emptyDescription="No closed tasks, review-ready results, executed orders, or reported spend since your last visit."
		loadingTitle="Loading recent evidence"
		loadingDescription="Checking recent events and usage for the selected Space."
		errorTitle="Digest unavailable"
		errorFallback="Recent evidence could not be loaded."
		retryLabel="Retry"
		onRetry={onRetry}
	>
		<div class="grid gap-2 sm:grid-cols-2" aria-label="Digest metrics">
			{#each metrics as metric (metric.label)}
				{@const Icon = metric.icon}
				<div class={cn("rounded-md border p-3", toneClass(metric.tone))} data-slot="digest-metric">
					<div class="flex items-center justify-between gap-3">
						<span class="text-sm font-medium text-foreground">{metric.label}</span>
						<Icon class="size-4 shrink-0" aria-hidden="true" />
					</div>
					<div class="mt-2 text-2xl font-semibold tabular-nums text-foreground">{metric.value}</div>
					<p class="mt-1 text-xs leading-5 text-muted-foreground">{metric.description}</p>
				</div>
			{/each}
		</div>
	</DataState>
</section>
