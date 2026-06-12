<script lang="ts">
	import type { Approval } from "$lib/api/client";
	import ApprovalCard from "./ApprovalCard.svelte";
	import FailureCard from "./FailureCard.svelte";
	import QuestionCard from "./QuestionCard.svelte";
	import type { InboxDecisionInput } from "./inbox";

	let {
		approval,
		busy = false,
		conflict = false,
		nowMs = Date.now(),
		onDecide,
		onReturnRequest,
		onOpenRun,
		onRefresh,
		class: className,
	}: {
		approval: Approval;
		busy?: boolean;
		conflict?: boolean;
		nowMs?: number;
		onDecide?: (input: InboxDecisionInput) => void;
		onReturnRequest?: () => void;
		onOpenRun?: () => void;
		onRefresh?: () => void;
		class?: string;
	} = $props();
</script>

{#if approval.kind === "question"}
	<QuestionCard
		{approval}
		{busy}
		{conflict}
		{nowMs}
		onReply={(reply) => onDecide?.({ decision: "approved", feedback: reply })}
		{onRefresh}
		class={className}
	/>
{:else if approval.kind === "failure"}
	<FailureCard
		{approval}
		{busy}
		{conflict}
		{nowMs}
		onRestart={() => onDecide?.({ decision: "approved" })}
		onSuspend={() => onDecide?.({ decision: "rejected" })}
		{onOpenRun}
		{onRefresh}
		class={className}
	/>
{:else}
	<ApprovalCard
		{approval}
		{busy}
		{conflict}
		{nowMs}
		onSign={() => onDecide?.({ decision: "approved" })}
		onReturn={() => onReturnRequest?.()}
		onReject={() => onDecide?.({ decision: "rejected" })}
		{onRefresh}
		class={className}
	/>
{/if}
