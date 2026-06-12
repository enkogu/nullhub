<script lang="ts" module>
	export type RunningNowState = "idle" | "loading" | "ready" | "error";
</script>

<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import { cn } from "$lib/utils.js";
	import CountBadge from "$lib/components/CountBadge.svelte";
	import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
	import RunRow from "$lib/components/work/RunRow.svelte";
	import type { LiveRun } from "$lib/components/work/live";

	let {
		runs = [],
		state = "idle",
		error = null,
		nowMs = Date.now(),
		limit = 3,
		onRetry,
		class: className,
	}: {
		runs?: LiveRun[];
		state?: RunningNowState;
		error?: unknown;
		nowMs?: number;
		limit?: number;
		onRetry?: () => void;
		class?: string;
	} = $props();

	let activeRuns = $derived(runs.filter((run) => run.bucket === "active" || run.bucket === "attention" || run.bucket === "stalled"));
	let visibleRuns = $derived(activeRuns.slice(0, limit));
	let isLoading = $derived(state === "idle" || state === "loading");
	let dataState = $derived(
		(isLoading ? "loading" : state === "error" ? "error" : visibleRuns.length ? "populated" : "empty") as DataStateKind,
	);
</script>

<section data-slot="running-now" class={cn("min-w-0 space-y-3 rounded-lg border bg-card p-4", className)} aria-label="Running now">
	<div class="flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<h2 class="text-base font-semibold">Running now</h2>
			<CountBadge count={activeRuns.length} label={activeRuns.length === 1 ? "run" : "runs"} tone={activeRuns.length ? "primary" : "neutral"} loading={isLoading} />
		</div>
		<Button variant="ghost" size="sm" href="/work/live">Open live</Button>
	</div>

	<DataState
		state={dataState}
		{error}
		emptyTitle="Nothing is running"
		emptyDescription="Live loop, workflow, and agent runs will appear here while work is moving."
		loadingTitle="Loading live runs"
		loadingDescription="Fetching active work for the selected Space."
		errorTitle="Live runs unavailable"
		errorFallback="Live runs could not be loaded."
		retryLabel="Retry"
		onRetry={onRetry}
	>
		<div class="grid gap-2" aria-label="Active runs">
			{#each visibleRuns as run (run.id)}
				<RunRow {run} {nowMs} />
			{/each}
		</div>
	</DataState>
</section>
