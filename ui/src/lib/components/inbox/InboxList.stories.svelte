<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import InboxList from "./InboxList.svelte";
	import { inboxFixtureApprovals, inboxFixtureNowMs } from "./fixtures";

	const { Story } = defineMeta({
		title: "Inbox/InboxList",
		component: InboxList,
	});

	const onDecide = async () => undefined;
</script>

{#snippet listTemplate(args)}
	<div class="max-w-4xl">
		<InboxList {...args} />
	</div>
{/snippet}

<Story
	name="Populated"
	args={{ approvals: inboxFixtureApprovals, listState: "ready", nowMs: inboxFixtureNowMs, onDecide }}
	template={listTemplate}
/>
<Story
	name="Loading"
	args={{ approvals: [], listState: "loading", nowMs: inboxFixtureNowMs }}
	template={listTemplate}
/>
<Story
	name="Empty"
	args={{ approvals: [], listState: "ready", nowMs: inboxFixtureNowMs }}
	template={listTemplate}
/>
<Story
	name="Error"
	args={{
		approvals: [],
		listState: "error",
		error: new Error("Approvals unavailable."),
		nowMs: inboxFixtureNowMs,
	}}
	template={listTemplate}
/>
