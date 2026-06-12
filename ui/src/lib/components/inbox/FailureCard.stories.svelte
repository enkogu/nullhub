<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import FailureCard from "./FailureCard.svelte";
	import { failureApproval, inboxFixtureNowMs } from "./fixtures";

	const { Story } = defineMeta({
		title: "Inbox/FailureCard",
		component: FailureCard,
	});

	const restartedFailure = {
		...failureApproval,
		status: "approved",
		decidedAtMs: inboxFixtureNowMs - 30 * 60_000,
	};
</script>

{#snippet cardTemplate(args)}
	<div class="max-w-3xl">
		<FailureCard {...args} />
	</div>
{/snippet}

<Story
	name="Pending"
	args={{ approval: failureApproval, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
<Story
	name="Busy"
	args={{ approval: failureApproval, busy: true, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
<Story
	name="Decided Elsewhere"
	args={{ approval: failureApproval, conflict: true, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
<Story
	name="Restarted History"
	args={{ approval: restartedFailure, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
