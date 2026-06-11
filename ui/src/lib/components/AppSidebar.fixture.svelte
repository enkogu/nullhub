<script lang="ts">
	import AppSidebar from "./AppSidebar.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";

	let { activePath = "/work/tasks" }: { activePath?: string } = $props();
</script>

<Sidebar.Provider open={true}>
	<AppSidebar {activePath} collapsible="none" pollHubStatus={false} hubStatus="online">
		{#snippet inboxBadge()}
			<span data-testid="inbox-badge">9</span>
		{/snippet}
	</AppSidebar>
</Sidebar.Provider>
