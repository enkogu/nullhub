<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import CommandPalette from "./CommandPalette.svelte";

	const { Story } = defineMeta({
		title: "Components/CommandPalette",
		component: CommandPalette,
	});
</script>

{#snippet openTemplate(args)}
	<CommandPalette
		{...args}
		navigate={() => {}}
		createTask={async () => ({ id: "task-story" })}
		onCreateSpace={() => {}}
	/>
{/snippet}

<Story
	name="Open"
	args={{
		open: true,
		ticketsInstance: "tickets",
	}}
	template={openTemplate}
/>
