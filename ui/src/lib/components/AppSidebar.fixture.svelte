<script lang="ts">
	import AppSidebar from "./AppSidebar.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";

	let {
		activePath = "/work/tasks",
		badgeCount = 9,
	}: { activePath?: string; badgeCount?: number } = $props();
</script>

<Sidebar.Provider open={true}>
	<AppSidebar {activePath} collapsible="none" pollHubStatus={false} hubStatus="online">
		{#snippet inboxBadge()}
			{#if badgeCount > 0}
				<span data-testid="inbox-badge">{badgeCount}</span>
			{/if}
		{/snippet}
	</AppSidebar>
</Sidebar.Provider>
