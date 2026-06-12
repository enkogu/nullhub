<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import DigestCard from "./DigestCard.svelte";
	import type { DigestEvent, DigestUsagePayload } from "./digest";

	const { Story } = defineMeta({
		title: "Dashboard/DigestCard",
		component: DigestCard,
	});

	const nowMs = 1_780_000_000_000;
	const lastSeenMs = nowMs - 8 * 60 * 60_000;

	function event(overrides: Partial<DigestEvent>): DigestEvent {
		return {
			id: 1,
			spaceId: "ops",
			type: "task.completed",
			source: "nulltickets",
			subjectType: "task",
			subjectId: "task-1",
			title: "Task completed",
			summary: "A task reached a terminal state.",
			severity: "success",
			evidenceRef: "run:task-1",
			createdAtMs: nowMs - 2 * 60 * 60_000,
			payload: { status: "completed" },
			...overrides,
		};
	}

	const populatedEvents: DigestEvent[] = [
		event({ id: 1, subjectId: "task-1", title: "Close support triage" }),
		event({
			id: 2,
			type: "loop.review_requested",
			source: "nulltickets",
			subjectType: "deliverable",
			subjectId: "result-1",
			title: "Playbook ready for review",
			payload: { lifecycle: "review" },
		}),
		event({
			id: 3,
			type: "order.executed",
			source: "orders",
			subjectType: "order",
			subjectId: "order-1",
			title: "Morning order executed",
			payload: { status: "executed" },
		}),
	];

	const usage: DigestUsagePayload = {
		timeseries: [
			{ bucket_start: Math.floor((lastSeenMs + 60_000) / 1000), total_cost_usd: 0.0825 },
			{ bucket_start: Math.floor((lastSeenMs - 60_000) / 1000), total_cost_usd: 0.03 },
		],
	};
</script>

{#snippet cardTemplate(args)}
	<div class="max-w-2xl">
		<DigestCard {...args} />
	</div>
{/snippet}

<Story
	name="Populated"
	args={{ events: populatedEvents, usage, state: "ready", lastSeenMs }}
	template={cardTemplate}
/>
<Story name="Loading" args={{ events: [], usage: null, state: "loading", lastSeenMs }} template={cardTemplate} />
<Story name="Empty" args={{ events: [], usage: { totals: { total_cost_usd: 0 } }, state: "ready", lastSeenMs }} template={cardTemplate} />
<Story
	name="Error"
	args={{ events: [], usage: null, state: "error", error: new Error("Digest feed down."), lastSeenMs }}
	template={cardTemplate}
/>
