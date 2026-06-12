<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import SpaceOverviewRow, { type SpaceOverviewRowModel } from "./SpaceOverviewRow.svelte";

	const { Story } = defineMeta({
		title: "Shell/SpaceOverviewRow",
		component: SpaceOverviewRow,
	});

	const row: SpaceOverviewRowModel = {
		space: { id: "ops", name: "Operations", kind: "workspace", stage: "active" },
		aggregate: { spaceId: "ops", pendingCount: 4, liveCount: 2, spendUsd: 12.3456 },
	};

	const unreportedSpendRow: SpaceOverviewRowModel = {
		space: { id: "lab", name: "Lab", kind: "workspace", stage: "paused" },
		aggregate: { spaceId: "lab", pendingCount: 0, liveCount: 0, spendUsd: null },
	};
</script>

{#snippet template(args)}
	<div class="max-w-md rounded-lg border p-2">
		<SpaceOverviewRow {...args} />
	</div>
{/snippet}

<Story name="Populated" args={{ row }} template={template} />
<Story name="Selected" args={{ row, selected: true }} template={template} />
<Story name="Spend Not Reported" args={{ row: unreportedSpendRow }} template={template} />
