<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import EmptyState from "./EmptyState.svelte";

	const { Story } = defineMeta({
		title: "Components/EmptyState",
		component: EmptyState,
	});
</script>

{#snippet emptyTemplate(args)}
	<EmptyState {...args} />
{/snippet}

<Story
	name="Empty"
	args={{
		title: "No orders match this filter",
		description: "Adjust the filter set or create a new order for this space.",
		actionLabel: "Create order",
		secondaryActionLabel: "Clear filters",
		icon: "search",
		tone: "primary",
	}}
	template={emptyTemplate}
/>
<Story
	name="Loading"
	args={{
		loading: true,
		title: "Loading",
		description: "Loading empty state.",
	}}
	template={emptyTemplate}
/>
