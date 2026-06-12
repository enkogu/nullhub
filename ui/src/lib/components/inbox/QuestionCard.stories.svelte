<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import QuestionCard from "./QuestionCard.svelte";
	import { inboxFixtureNowMs, questionApproval } from "./fixtures";

	const { Story } = defineMeta({
		title: "Inbox/QuestionCard",
		component: QuestionCard,
	});

	const answeredQuestion = {
		...questionApproval,
		status: "approved",
		feedback: "Use a friendly, direct tone.",
		decidedAtMs: inboxFixtureNowMs - 5 * 60_000,
	};
</script>

{#snippet cardTemplate(args)}
	<div class="max-w-3xl">
		<QuestionCard {...args} />
	</div>
{/snippet}

<Story
	name="Pending"
	args={{ approval: questionApproval, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
<Story
	name="Busy"
	args={{ approval: questionApproval, busy: true, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
<Story
	name="Decided Elsewhere"
	args={{ approval: questionApproval, conflict: true, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
<Story
	name="Answered History"
	args={{ approval: answeredQuestion, nowMs: inboxFixtureNowMs }}
	template={cardTemplate}
/>
