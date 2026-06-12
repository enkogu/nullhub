<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import TeamSwitcher from "./team-switcher.svelte";
	import type { SpaceOverviewRowModel } from "./SpaceOverviewRow.svelte";

	const { Story } = defineMeta({
		title: "Shell/SpaceSwitcher",
		component: TeamSwitcher,
	});

	const rows: SpaceOverviewRowModel[] = [
		{
			space: { id: "ops", name: "Operations", kind: "workspace", stage: "active" },
			aggregate: { spaceId: "ops", pendingCount: 2, liveCount: 3, spendUsd: 12.3456 },
		},
		{
			space: { id: "lab", name: "Lab", kind: "workspace", stage: "paused" },
			aggregate: { spaceId: "lab", pendingCount: 1, liveCount: 1, spendUsd: 1.25 },
		},
	];
</script>

{#snippet template(args)}
	<div class="w-96 p-4">
		<TeamSwitcher {...args} />
	</div>
{/snippet}

<Story name="Populated All" args={{ rows, state: "ready", selectedSpaceId: null, defaultOpen: true }} template={template} />
<Story name="Populated Selected" args={{ rows, state: "ready", selectedSpaceId: "ops", defaultOpen: true }} template={template} />
<Story name="Loading" args={{ rows: [], state: "loading", defaultOpen: true }} template={template} />
<Story name="Empty" args={{ rows: [], state: "ready", defaultOpen: true }} template={template} />
<Story
	name="Error"
	args={{ rows: [], state: "error", error: new Error("Spaces API unavailable."), defaultOpen: true }}
	template={template}
/>
