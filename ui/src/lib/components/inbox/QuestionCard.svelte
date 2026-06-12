<script lang="ts">
	import ClockIcon from "@lucide/svelte/icons/clock";
	import MessageCircleQuestionIcon from "@lucide/svelte/icons/message-circle-question";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import { cn } from "$lib/utils.js";
	import type { Approval } from "$lib/api/client";
	import MarkdownViewer from "$lib/components/MarkdownViewer.svelte";
	import { formatInboxTime, statusLabel } from "./inbox";

	let {
		approval,
		busy = false,
		conflict = false,
		nowMs = Date.now(),
		onReply,
		onRefresh,
		class: className,
	}: {
		approval: Approval;
		busy?: boolean;
		conflict?: boolean;
		nowMs?: number;
		onReply?: (reply: string) => void;
		onRefresh?: () => void;
		class?: string;
	} = $props();

	let reply = $state("");
	let pending = $derived(approval.status === "pending" && !conflict);
	let createdLabel = $derived(formatInboxTime(approval.createdAtMs, nowMs));
	let replyFieldId = $derived(`question-reply-${approval.id}`);

	function sendReply() {
		const trimmed = reply.trim();
		if (!trimmed) return;
		onReply?.(trimmed);
	}
</script>

<article
	data-slot="question-card"
	class={cn("rounded-lg border bg-card p-4 text-card-foreground shadow-sm", className)}
	aria-label={`Question: ${approval.title}`}
>
	<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
		<div class="min-w-0 space-y-2">
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="secondary"><MessageCircleQuestionIcon class="size-3.5" aria-hidden="true" /> Question</Badge>
				{#if approval.queue}
					<Badge variant="outline">{approval.queue}</Badge>
				{/if}
				{#if approval.status !== "pending"}
					<Badge variant={approval.status === "approved" ? "success" : "warning"}>{statusLabel(approval.status)}</Badge>
				{/if}
			</div>
			<h3 class="text-sm font-semibold">{approval.title}</h3>
			{#if approval.targetRef}
				<p class="text-xs text-muted-foreground">Waiting run: {approval.targetRef}</p>
			{/if}
		</div>
		<time class="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
			<ClockIcon class="size-3.5" aria-hidden="true" />
			{createdLabel}
		</time>
	</div>

	{#if approval.summary}
		<div class="mt-3 rounded-md border bg-muted/30 p-3">
			<MarkdownViewer markdown={approval.summary} ariaLabel="Question details" />
		</div>
	{/if}

	{#if approval.feedback}
		<p class="mt-3 text-sm text-muted-foreground"><span class="font-medium">Reply:</span> {approval.feedback}</p>
	{/if}

	{#if conflict}
		<div class="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-watch/40 bg-watch/10 p-3" role="status">
			<p class="text-sm">Decided elsewhere. This question was already answered in another session.</p>
			<Button variant="outline" size="sm" onclick={() => onRefresh?.()}>Refresh</Button>
		</div>
	{:else if pending}
		<div class="mt-4 space-y-2">
			<Label for={replyFieldId}>Reply to the waiting run</Label>
			<Textarea id={replyFieldId} bind:value={reply} rows={3} placeholder="Answer the agent's question" />
			<Button size="sm" disabled={busy || !reply.trim()} onclick={sendReply}>Send reply</Button>
		</div>
	{/if}
</article>
