<script lang="ts" module>
	export type NeedsYouListState = "idle" | "loading" | "ready" | "error";
</script>

<script lang="ts">
	import ClockIcon from "@lucide/svelte/icons/clock";
	import MessageCircleQuestionIcon from "@lucide/svelte/icons/message-circle-question";
	import PenLineIcon from "@lucide/svelte/icons/pen-line";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { cn } from "$lib/utils.js";
	import type { Approval } from "$lib/api/client";
	import CountBadge from "$lib/components/CountBadge.svelte";
	import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
	import { formatInboxTime, isPendingApproval } from "$lib/components/inbox/inbox";

	let {
		approvals = [],
		state = "idle",
		error = null,
		nowMs = Date.now(),
		limit = 3,
		onRetry,
		class: className,
	}: {
		approvals?: Approval[];
		state?: NeedsYouListState;
		error?: unknown;
		nowMs?: number;
		limit?: number;
		onRetry?: () => void;
		class?: string;
	} = $props();

	let pending = $derived(approvals.filter(isPendingApproval));
	let newest = $derived([...pending].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, limit));
	let isLoading = $derived(state === "idle" || state === "loading");
	let dataState = $derived(
		(isLoading ? "loading" : state === "error" ? "error" : newest.length ? "populated" : "empty") as DataStateKind,
	);

	function kindIcon(kind: string) {
		if (kind === "question") return MessageCircleQuestionIcon;
		if (kind === "failure") return TriangleAlertIcon;
		return PenLineIcon;
	}

	function kindLabel(kind: string): string {
		if (kind === "question") return "Question";
		if (kind === "failure") return "Failure";
		return "Signature";
	}
</script>

<section data-slot="needs-you" class={cn("min-w-0 space-y-3 rounded-lg border bg-card p-4", className)} aria-label="Needs you">
	<div class="flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<h2 class="text-base font-semibold">Needs you</h2>
			<CountBadge count={pending.length} label="pending" tone={pending.length ? "watch" : "neutral"} loading={isLoading} />
		</div>
		<Button variant="ghost" size="sm" href="/inbox">Open inbox</Button>
	</div>

	<DataState
		state={dataState}
		{error}
		emptyTitle="Nothing needs you"
		emptyDescription="Approvals, questions, and failures will appear here when work needs attention."
		loadingTitle="Loading approvals"
		loadingDescription="Fetching pending requests for the selected Space."
		errorTitle="Approvals unavailable"
		errorFallback="Pending requests could not be loaded."
		retryLabel="Retry"
		onRetry={onRetry}
	>
		<ul class="grid gap-2" aria-label="Newest pending requests">
			{#each newest as approval (approval.id)}
				{@const Icon = kindIcon(approval.kind)}
				<li>
					<a
						href="/inbox"
						class="flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-muted/50"
						data-slot="needs-you-row"
					>
						<span class="flex min-w-0 items-center gap-2">
							<Badge variant={approval.kind === "failure" ? "destructive" : "secondary"}>
								<Icon class="size-3.5" aria-hidden="true" />
								{kindLabel(approval.kind)}
							</Badge>
							<span class="truncate text-sm font-medium">{approval.title}</span>
						</span>
						<span class="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
							<ClockIcon class="size-3.5" aria-hidden="true" />
							{formatInboxTime(approval.createdAtMs, nowMs)}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</DataState>
</section>
