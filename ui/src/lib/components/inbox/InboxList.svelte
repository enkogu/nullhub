<script lang="ts" module>
	export type InboxListState = "idle" | "loading" | "ready" | "error";
</script>

<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { cn } from "$lib/utils.js";
	import type { Approval } from "$lib/api/client";
	import CountBadge from "$lib/components/CountBadge.svelte";
	import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
	import FeedbackDialog from "./FeedbackDialog.svelte";
	import InboxItem from "./InboxItem.svelte";
	import {
		INBOX_QUEUE_ALL,
		decisionLabel,
		filterInboxApprovals,
		inboxQueueTabs,
		type InboxDecisionInput,
	} from "./inbox";

	type DecideError = Error & { status?: number };

	type PendingUndo = {
		approval: Approval;
		input: InboxDecisionInput;
		timer: ReturnType<typeof setTimeout>;
	};

	let {
		approvals = [],
		listState = "idle",
		error = null,
		nowMs = Date.now(),
		undoWindowMs = 5000,
		onDecide,
		onRetry,
		onOpenRun,
		class: className,
	}: {
		approvals?: Approval[];
		listState?: InboxListState;
		error?: unknown;
		nowMs?: number;
		undoWindowMs?: number;
		onDecide?: (approval: Approval, input: InboxDecisionInput) => Promise<unknown>;
		onRetry?: () => void;
		onOpenRun?: (approval: Approval) => void;
		class?: string;
	} = $props();

	let selectedQueue = $state(INBOX_QUEUE_ALL);
	let showHistory = $state(false);
	let optimistic = $state<Record<number, InboxDecisionInput>>({});
	let conflicts = $state<Record<number, boolean>>({});
	let busyIds = $state<Record<number, boolean>>({});
	let pendingUndo = $state<PendingUndo | null>(null);
	let feedbackFor = $state<Approval | null>(null);
	let feedbackOpen = $state(false);
	let decideError = $state<string | null>(null);

	let effectiveApprovals = $derived(
		approvals.map((approval) => {
			const override = optimistic[approval.id];
			if (!override || approval.status !== "pending") return approval;
			return { ...approval, status: override.decision, feedback: override.feedback ?? "" };
		}),
	);
	let conflictApprovals = $derived(
		approvals.filter((approval) => conflicts[approval.id] && approval.status === "pending"),
	);
	let queueTabs = $derived(inboxQueueTabs(effectiveApprovals));
	let visibleApprovals = $derived(
		filterInboxApprovals(effectiveApprovals, { queue: selectedQueue, history: showHistory }).filter(
			(approval) => !conflicts[approval.id],
		),
	);
	let isLoading = $derived(listState === "idle" || listState === "loading");
	let dataState = $derived(
		(isLoading
			? "loading"
			: listState === "error"
				? "error"
				: visibleApprovals.length || conflictApprovals.length
					? "populated"
					: "empty") as DataStateKind,
	);

	function setOptimistic(id: number, input: InboxDecisionInput | null) {
		const next = { ...optimistic };
		if (input) next[id] = input;
		else delete next[id];
		optimistic = next;
	}

	function setBusy(id: number, busy: boolean) {
		const next = { ...busyIds };
		if (busy) next[id] = true;
		else delete next[id];
		busyIds = next;
	}

	function decide(approval: Approval, input: InboxDecisionInput) {
		decideError = null;
		if (pendingUndo) commit(pendingUndo, true);
		setOptimistic(approval.id, input);
		pendingUndo = {
			approval,
			input,
			timer: setTimeout(() => {
				if (pendingUndo?.approval.id === approval.id) commit(pendingUndo);
			}, undoWindowMs),
		};
	}

	function undo() {
		const entry = pendingUndo;
		if (!entry) return;
		clearTimeout(entry.timer);
		pendingUndo = null;
		setOptimistic(entry.approval.id, null);
	}

	function commit(entry: PendingUndo, replaced = false) {
		clearTimeout(entry.timer);
		if (pendingUndo === entry || !replaced) pendingUndo = null;
		setBusy(entry.approval.id, true);
		void (onDecide?.(entry.approval, entry.input) ?? Promise.resolve())
			.catch((error: DecideError) => {
				setOptimistic(entry.approval.id, null);
				if (error?.status === 409) {
					conflicts = { ...conflicts, [entry.approval.id]: true };
				} else {
					decideError = error instanceof Error ? error.message : String(error);
				}
			})
			.finally(() => {
				setBusy(entry.approval.id, false);
			});
	}

	function requestReturn(approval: Approval) {
		feedbackFor = approval;
		feedbackOpen = true;
	}

	function submitFeedback(feedback: string) {
		const approval = feedbackFor;
		feedbackFor = null;
		if (approval) decide(approval, { decision: "pushed_back", feedback });
	}

	function refreshConflicts() {
		conflicts = {};
		onRetry?.();
	}
</script>

<section data-slot="inbox-list" class={cn("min-w-0 space-y-4", className)}>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<nav class="flex flex-wrap gap-2" aria-label="Inbox queues">
			{#each queueTabs as tab (tab.queue)}
				<Button
					variant={selectedQueue === tab.queue ? "secondary" : "outline"}
					size="sm"
					aria-pressed={selectedQueue === tab.queue}
					onclick={() => (selectedQueue = tab.queue)}
				>
					{tab.label}
					<CountBadge count={tab.count} label={`pending in ${tab.label}`} tone={tab.count ? "primary" : "neutral"} />
				</Button>
			{/each}
		</nav>
		<div class="flex items-center gap-2">
			<Switch id="inbox-history-toggle" bind:checked={showHistory} />
			<Label for="inbox-history-toggle" class="text-sm text-muted-foreground">History</Label>
		</div>
	</div>

	{#if pendingUndo}
		<div
			class="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2"
			role="status"
			aria-live="polite"
			data-slot="undo-toast"
		>
			<p class="text-sm">
				{decisionLabel(pendingUndo.input.decision)}: <span class="font-medium">{pendingUndo.approval.title}</span>
			</p>
			<Button variant="outline" size="sm" onclick={undo}>Undo</Button>
		</div>
	{/if}

	{#if decideError}
		<div class="rounded-md border border-risk/40 bg-risk/10 px-3 py-2" role="alert">
			<p class="text-sm">Decision failed: {decideError}</p>
		</div>
	{/if}

	{#if conflictApprovals.length > 0 && !showHistory}
		<div class="grid gap-3" aria-label="Conflicted inbox items">
			{#each conflictApprovals as approval (approval.id)}
				<InboxItem {approval} conflict {nowMs} onRefresh={refreshConflicts} />
			{/each}
		</div>
	{/if}

	<DataState
		state={dataState}
		{error}
		emptyTitle={showHistory ? "No decided requests yet" : "No pending requests"}
		emptyDescription={showHistory
			? "Decisions you make will be listed here."
			: "New approvals, questions, and failures will appear here when work needs attention."}
		loadingTitle="Loading inbox"
		loadingDescription="Fetching pending requests for the selected Space."
		errorTitle="Inbox unavailable"
		errorFallback="Inbox items could not be loaded."
		retryLabel="Retry"
		onRetry={onRetry}
	>
		<div class="grid gap-3" aria-label="Inbox items">
			{#each visibleApprovals as approval (approval.id)}
				<InboxItem
					{approval}
					busy={Boolean(busyIds[approval.id])}
					{nowMs}
					onDecide={(input) => decide(approval, input)}
					onReturnRequest={() => requestReturn(approval)}
					onOpenRun={() => onOpenRun?.(approval)}
					onRefresh={onRetry}
				/>
			{/each}
		</div>
	</DataState>

	<FeedbackDialog bind:open={feedbackOpen} onSubmit={submitFeedback} onCancel={() => (feedbackFor = null)} />
</section>
