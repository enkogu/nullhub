<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import NeedsYouList from "./NeedsYouList.svelte";
	import {
		failureApproval,
		fixtureApproval,
		inboxFixtureApprovals,
		inboxFixtureNowMs,
		questionApproval,
	} from "$lib/components/inbox/fixtures";

	const { Story } = defineMeta({
		title: "Dashboard/NeedsYouList",
		component: NeedsYouList,
	});

	const manyApprovals = [
		failureApproval,
		questionApproval,
		fixtureApproval({ id: 11, title: "Sign the staging rollout" }),
		fixtureApproval({ id: 12, title: "Sign the pricing change" }),
	];
</script>

{#snippet listTemplate(args)}
	<div class="max-w-2xl">
		<NeedsYouList {...args} />
	</div>
{/snippet}

<Story
	name="Populated"
	args={{ approvals: inboxFixtureApprovals, state: "ready", nowMs: inboxFixtureNowMs }}
	template={listTemplate}
/>
<Story
	name="Overflow (3 newest)"
	args={{ approvals: manyApprovals, state: "ready", nowMs: inboxFixtureNowMs }}
	template={listTemplate}
/>
<Story name="Loading" args={{ approvals: [], state: "loading", nowMs: inboxFixtureNowMs }} template={listTemplate} />
<Story name="Empty" args={{ approvals: [], state: "ready", nowMs: inboxFixtureNowMs }} template={listTemplate} />
<Story
	name="Error"
	args={{ approvals: [], state: "error", error: new Error("Approvals unavailable."), nowMs: inboxFixtureNowMs }}
	template={listTemplate}
/>
