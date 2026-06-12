<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import AppSidebar from "./AppSidebar.svelte";

	const { Story } = defineMeta({
		title: "Components/AppSidebar",
		component: AppSidebar,
	});
</script>

<script lang="ts">
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
</script>

{#snippet populatedTemplate()}
	<Sidebar.Provider open={true} class="min-h-[640px]">
		<AppSidebar activePath="/work/tasks" pollHubStatus={false} hubStatus="online">
			{#snippet inboxBadge()}
				<span class="font-mono text-xs tabular-nums">4</span>
			{/snippet}
		</AppSidebar>
		<Sidebar.Inset class="min-h-[640px] p-6">
			<div class="text-sm text-muted-foreground">Populated shell preview</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/snippet}

{#snippet inboxTemplate()}
	<Sidebar.Provider open={true} class="min-h-[640px]">
		<AppSidebar activePath="/inbox" pollHubStatus={false} hubStatus="online">
			{#snippet inboxBadge()}
				<span class="font-mono text-xs tabular-nums">12</span>
			{/snippet}
		</AppSidebar>
		<Sidebar.Inset class="min-h-[640px] p-6">
			<div class="text-sm text-muted-foreground">Inbox active with badge slot</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/snippet}

{#snippet inboxZeroTemplate()}
	<Sidebar.Provider open={true} class="min-h-[640px]">
		<AppSidebar activePath="/inbox" pollHubStatus={false} hubStatus="online">
			{#snippet inboxBadge()}
				<!-- Zero pending: the NeedsYou source hides the badge entirely. -->
			{/snippet}
		</AppSidebar>
		<Sidebar.Inset class="min-h-[640px] p-6">
			<div class="text-sm text-muted-foreground">Inbox active with zero pending (badge hidden)</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/snippet}

{#snippet systemTemplate()}
	<Sidebar.Provider open={true} class="min-h-[640px]">
		<AppSidebar activePath="/settings" pollHubStatus={false} hubStatus="offline" />
		<Sidebar.Inset class="min-h-[640px] p-6">
			<div class="text-sm text-muted-foreground">System active while the System disclosure remains collapsed</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/snippet}

<Story name="Populated" template={populatedTemplate} />
<Story name="Inbox Badge" template={inboxTemplate} />
<Story name="Inbox Badge Hidden" template={inboxZeroTemplate} />
<Story name="System Collapsed" template={systemTemplate} />
