<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import Timeline, { type TimelineItem } from "./Timeline.svelte";

	const { Story } = defineMeta({
		title: "Components/Timeline",
		component: Timeline,
	});

	const items: TimelineItem[] = [
		{
			id: "queued",
			title: "Order queued",
			description: "The order entered the selected space queue.",
			timestamp: "2026-06-10T09:00:00Z",
			status: "complete",
			meta: "orders",
		},
		{
			id: "running",
			title: "Loop running",
			description: "Agent work is collecting evidence.",
			timestamp: "2026-06-10T09:12:00Z",
			status: "current",
			meta: "work",
		},
		{
			id: "review",
			title: "Human review",
			description: "Approvals will appear in Inbox.",
			status: "pending",
		},
	];
</script>

{#snippet timelineTemplate(args)}
	<Timeline {...args} />
{/snippet}

<Story name="Populated" args={{ title: "Run timeline", items, selectedId: "running" }} template={timelineTemplate} />
<Story name="Loading" args={{ state: "loading", title: "Run timeline" }} template={timelineTemplate} />
<Story name="Empty" args={{ state: "empty", title: "Run timeline" }} template={timelineTemplate} />
<Story name="Error" args={{ state: "error", errorMessage: "Event stream failed." }} template={timelineTemplate} />
