<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import RunningNow from "./RunningNow.svelte";
	import type { LiveRun } from "$lib/components/work/live";

	const { Story } = defineMeta({
		title: "Dashboard/RunningNow",
		component: RunningNow,
	});

	const nowMs = 1_780_000_000_000;

	function liveRun(overrides: Partial<LiveRun>): LiveRun {
		return {
			id: "run-1",
			source: "loop",
			title: "Support triage loop",
			summary: "Iterating on open support requests.",
			owner: "Athena",
			ownerLabel: "Agent",
			status: "Running",
			bucket: "active",
			surfaceLabel: "Loop run",
			startedAtMs: nowMs - 10 * 60_000,
			updatedAtMs: nowMs - 60_000,
			durationMs: null,
			href: "/work/loops/runs",
			watchState: "unavailable",
			stalled: false,
			...overrides,
		};
	}

	const runs: LiveRun[] = [
		liveRun({}),
		liveRun({
			id: "run-2",
			source: "workflow",
			title: "Onboarding workflow",
			summary: "Generating the deliverable package.",
			owner: "Iris",
			surfaceLabel: "Workflow run",
			updatedAtMs: nowMs - 3 * 60_000,
			href: "/orders/workflows/runs",
		}),
		liveRun({
			id: "run-3",
			source: "agent",
			title: "Agent update",
			summary: "Research agent posted progress.",
			bucket: "attention",
			status: "Warning",
			updatedAtMs: nowMs - 7 * 60_000,
			href: "/work/activity",
		}),
	];
</script>

{#snippet template(args)}
	<div class="max-w-2xl">
		<RunningNow {...args} />
	</div>
{/snippet}

<Story name="Populated" args={{ runs, state: "ready", nowMs }} template={template} />
<Story name="Loading" args={{ runs: [], state: "loading", nowMs }} template={template} />
<Story name="Empty" args={{ runs: [], state: "ready", nowMs }} template={template} />
<Story
	name="Error"
	args={{ runs: [], state: "error", error: new Error("Live runs unavailable."), nowMs }}
	template={template}
/>
