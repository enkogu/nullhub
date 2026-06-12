<script lang="ts">
	import ClockIcon from "@lucide/svelte/icons/clock";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { cn } from "$lib/utils.js";
	import type { Approval } from "$lib/api/client";
	import MarkdownViewer from "$lib/components/MarkdownViewer.svelte";
	import { formatInboxTime, statusLabel } from "./inbox";

	let {
		approval,
		busy = false,
		conflict = false,
		nowMs = Date.now(),
		onRestart,
		onSuspend,
		onOpenRun,
		onRefresh,
		class: className,
	}: {
		approval: Approval;
		busy?: boolean;
		conflict?: boolean;
		nowMs?: number;
		onRestart?: () => void;
		onSuspend?: () => void;
		onOpenRun?: () => void;
		onRefresh?: () => void;
		class?: string;
	} = $props();

	let pending = $derived(approval.status === "pending" && !conflict);
	let createdLabel = $derived(formatInboxTime(approval.createdAtMs, nowMs));
</script>

<article
	data-slot="failure-card"
	class={cn("rounded-lg border border-risk/30 bg-card p-4 text-card-foreground shadow-sm", className)}
	aria-label={`Failure: ${approval.title}`}
>
	<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
		<div class="min-w-0 space-y-2">
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="destructive"><TriangleAlertIcon class="size-3.5" aria-hidden="true" /> Failure</Badge>
				{#if approval.queue}
					<Badge variant="outline">{approval.queue}</Badge>
				{/if}
				{#if approval.status !== "pending"}
					<Badge variant={approval.status === "approved" ? "success" : "warning"}>{statusLabel(approval.status)}</Badge>
				{/if}
			</div>
			<h3 class="text-sm font-semibold">{approval.title}</h3>
			{#if approval.targetRef}
				<p class="text-xs text-muted-foreground">Run: {approval.targetRef}</p>
			{/if}
		</div>
		<time class="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
			<ClockIcon class="size-3.5" aria-hidden="true" />
			{createdLabel}
		</time>
	</div>

	{#if approval.summary}
		<div class="mt-3 rounded-md border bg-muted/30 p-3">
			<MarkdownViewer markdown={approval.summary} ariaLabel="Failure details" />
		</div>
	{/if}

	{#if approval.feedback}
		<p class="mt-3 text-sm text-muted-foreground"><span class="font-medium">Feedback:</span> {approval.feedback}</p>
	{/if}

	{#if conflict}
		<div class="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-watch/40 bg-watch/10 p-3" role="status">
			<p class="text-sm">Decided elsewhere. This failure was already handled in another session.</p>
			<Button variant="outline" size="sm" onclick={() => onRefresh?.()}>Refresh</Button>
		</div>
	{:else if pending}
		<div class="mt-4 flex flex-wrap gap-2">
			<Button size="sm" disabled={busy} onclick={() => onRestart?.()}>Restart</Button>
			<Button variant="outline" size="sm" disabled={busy} onclick={() => onSuspend?.()}>Suspend</Button>
			<Button variant="ghost" size="sm" onclick={() => onOpenRun?.()}>Open run</Button>
		</div>
	{/if}
</article>
