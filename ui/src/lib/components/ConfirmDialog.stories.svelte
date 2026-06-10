<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import ConfirmDialog from "./ConfirmDialog.svelte";

	const { Story } = defineMeta({
		title: "Components/ConfirmDialog",
		component: ConfirmDialog,
	});
</script>

{#snippet dialogTemplate(args)}
	<ConfirmDialog {...args}>
		<p class="text-muted-foreground text-sm leading-6">
			This will pause scheduled work until a user starts it again.
		</p>
	</ConfirmDialog>
{/snippet}

<Story
	name="Closed"
	args={{
		open: false,
		title: "Pause order",
		description: "No dialog is visible.",
		confirmLabel: "Pause",
	}}
	template={dialogTemplate}
/>
<Story
	name="Open"
	args={{
		open: true,
		title: "Pause order",
		description: "Confirm before pausing this order.",
		confirmLabel: "Pause",
	}}
	template={dialogTemplate}
/>
<Story
	name="Destructive"
	args={{
		open: true,
		title: "Delete blueprint",
		description: "This removes the blueprint from the current space.",
		confirmLabel: "Delete",
		destructive: true,
	}}
	template={dialogTemplate}
/>
