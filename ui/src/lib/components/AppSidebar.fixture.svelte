<script lang="ts">
	import AppSidebar from "./AppSidebar.svelte";
	import type { SpaceOverviewRowModel } from "./SpaceOverviewRow.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";

	let {
		activePath = "/work/tasks",
		badgeCount = 9,
		activeSpaceId = "ops",
	}: { activePath?: string; badgeCount?: number; activeSpaceId?: string } = $props();

	const spaceRows: SpaceOverviewRowModel[] = [
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

<Sidebar.Provider open={true}>
	<AppSidebar {activePath} {activeSpaceId} {spaceRows} spaceSwitcherState="ready" collapsible="none" pollHubStatus={false} hubStatus="online">
		{#snippet inboxBadge()}
			{#if badgeCount > 0}
				<span data-testid="inbox-badge">{badgeCount}</span>
			{/if}
		{/snippet}
	</AppSidebar>
</Sidebar.Provider>
