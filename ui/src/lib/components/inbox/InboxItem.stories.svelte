<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import InboxItem from "./InboxItem.svelte";
	import { failureApproval, inboxFixtureNowMs, questionApproval, signatureApproval } from "./fixtures";

	const { Story } = defineMeta({
		title: "Inbox/InboxItem",
		component: InboxItem,
	});
</script>

{#snippet itemTemplate(args)}
	<div class="max-w-3xl">
		<InboxItem {...args} />
	</div>
{/snippet}

<Story
	name="Signature"
	args={{ approval: signatureApproval, nowMs: inboxFixtureNowMs }}
	template={itemTemplate}
/>
<Story
	name="Question"
	args={{ approval: questionApproval, nowMs: inboxFixtureNowMs }}
	template={itemTemplate}
/>
<Story
	name="Failure"
	args={{ approval: failureApproval, nowMs: inboxFixtureNowMs }}
	template={itemTemplate}
/>
<Story
	name="Decided Elsewhere"
	args={{ approval: signatureApproval, conflict: true, nowMs: inboxFixtureNowMs }}
	template={itemTemplate}
/>
