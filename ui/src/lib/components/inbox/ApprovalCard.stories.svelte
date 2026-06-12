<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import ApprovalCard from "./ApprovalCard.svelte";
	import { decidedApproval, diffSignatureApproval, inboxFixtureNowMs, signatureApproval } from "./fixtures";

	const { Story } = defineMeta({
		title: "Inbox/ApprovalCard",
		component: ApprovalCard,
	});
</script>

{#snippet cardTemplate(args)}
	<div class="max-w-3xl">
		<ApprovalCard {...args} />
	</div>
{/snippet}

<Story
	name="Pending Markdown"
	args={{ approval: signatureApproval, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
<Story
	name="Pending Diff"
	args={{ approval: diffSignatureApproval, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
<Story
	name="Busy"
	args={{ approval: signatureApproval, busy: true, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
<Story
	name="Decided Elsewhere"
	args={{ approval: signatureApproval, conflict: true, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
<Story
	name="Decided History"
	args={{ approval: decidedApproval, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
