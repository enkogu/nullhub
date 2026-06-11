<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import DataState from "./DataState.svelte";

	const { Story } = defineMeta({
		title: "Components/DataState",
		component: DataState,
	});
</script>

{#snippet dataStateTemplate(args)}
	<DataState {...args}>
		<div class="rounded-lg border bg-card p-4 text-card-foreground">
			<h3 class="text-sm font-semibold">Loaded inbox item</h3>
			<p class="mt-1 text-sm text-muted-foreground">Approval request from a workspace loop.</p>
		</div>
	</DataState>
{/snippet}

<Story name="Populated" args={{ state: "populated" }} template={dataStateTemplate} />
<Story name="Loading" args={{ state: "loading" }} template={dataStateTemplate} />
<Story
	name="Empty"
	args={{
		state: "empty",
		emptyTitle: "No inbox requests",
		emptyDescription: "Approvals and unresolved inputs will appear here.",
	}}
	template={dataStateTemplate}
/>
<Story
	name="Error"
	args={{
		state: "error",
		errorTitle: "Inbox unavailable",
		errorMessage: "Approvals could not be loaded.",
		errorDetails: "GET /api/approvals -> 503",
		retryLabel: "Retry",
	}}
	template={dataStateTemplate}
/>
