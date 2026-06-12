<script lang="ts">
	import ClockIcon from "@lucide/svelte/icons/clock";
	import PenLineIcon from "@lucide/svelte/icons/pen-line";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { cn } from "$lib/utils.js";
	import type { Approval } from "$lib/api/client";
	import DiffViewer from "$lib/components/DiffViewer.svelte";
	import MarkdownViewer from "$lib/components/MarkdownViewer.svelte";
	import { formatInboxTime, isLikelyDiff, parseUnifiedDiff, statusLabel } from "./inbox";

	let {
		approval,
		busy = false,
		conflict = false,
		nowMs = Date.now(),
		onSign,
		onReturn,
		onReject,
		onRefresh,
		class: className,
	}: {
		approval: Approval;
		busy?: boolean;
		conflict?: boolean;
		nowMs?: number;
		onSign?: () => void;
		onReturn?: () => void;
		onReject?: () => void;
		onRefresh?: () => void;
		class?: string;
	} = $props();

	let pending = $derived(approval.status === "pending" && !conflict);
	let diffPreview = $derived(isLikelyDiff(approval.summary) ? parseUnifiedDiff(approval.summary) : null);
	let createdLabel = $derived(formatInboxTime(approval.createdAtMs, nowMs));
</script>

<article
	data-slot="approval-card"
	class={cn("rounded-lg border bg-card p-4 text-card-foreground shadow-sm", className)}
	aria-label={`Signature request: ${approval.title}`}
>
	<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
		<div class="min-w-0 space-y-2">
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="secondary"><PenLineIcon class="size-3.5" aria-hidden="true" /> Signature</Badge>
				{#if approval.queue}
					<Badge variant="outline">{approval.queue}</Badge>
				{/if}
				{#if approval.status !== "pending"}
					<Badge variant={approval.status === "approved" ? "success" : approval.status === "rejected" ? "destructive" : "warning"}>
						{statusLabel(approval.status)}
					</Badge>
				{/if}
			</div>
			<h3 class="text-sm font-semibold">{approval.title}</h3>
			{#if approval.targetRef}
				<p class="text-xs text-muted-foreground">Target: {approval.targetRef}</p>
			{/if}
		</div>
		<time class="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
			<ClockIcon class="size-3.5" aria-hidden="true" />
			{createdLabel}
		</time>
	</div>

	{#if approval.summary}
		<div class="mt-3 rounded-md border bg-muted/30 p-3">
			{#if diffPreview && diffPreview.length > 0}
				<DiffViewer files={diffPreview} title="Proposed change" />
			{:else}
				<MarkdownViewer markdown={approval.summary} ariaLabel="Approval details" />
			{/if}
		</div>
	{/if}

	{#if approval.feedback}
		<p class="mt-3 text-sm text-muted-foreground"><span class="font-medium">Feedback:</span> {approval.feedback}</p>
	{/if}

	{#if conflict}
		<div class="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-watch/40 bg-watch/10 p-3" role="status">
			<p class="text-sm">Decided elsewhere. This request was already decided in another session.</p>
			<Button variant="outline" size="sm" onclick={() => onRefresh?.()}>Refresh</Button>
		</div>
	{:else if pending}
		<div class="mt-4 flex flex-wrap gap-2">
			<Button size="sm" disabled={busy} onclick={() => onSign?.()}>Sign</Button>
			<Button variant="outline" size="sm" disabled={busy} onclick={() => onReturn?.()}>Return</Button>
			<Button variant="destructive" size="sm" disabled={busy} onclick={() => onReject?.()}>Reject</Button>
		</div>
	{/if}
</article>
