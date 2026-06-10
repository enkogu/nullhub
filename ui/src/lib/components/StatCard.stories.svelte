<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import StatCard from "./StatCard.svelte";

	const { Story } = defineMeta({
		title: "Components/StatCard",
		component: StatCard,
	});
</script>

{#snippet statTemplate(args)}
	<div class="grid max-w-3xl gap-4 md:grid-cols-2">
		<StatCard {...args} />
	</div>
{/snippet}

<Story
	name="Populated"
	args={{
		title: "Open orders",
		eyebrow: "Orders",
		value: 42,
		description: "Across the selected space.",
		trendCount: 6,
		trendLabel: "ready",
		trendTone: "ok",
	}}
	template={statTemplate}
/>
<Story name="Loading" args={{ title: "Open orders", state: "loading" }} template={statTemplate} />
<Story name="Empty" args={{ title: "Open orders", state: "empty", description: "No orders are active." }} template={statTemplate} />
<Story
	name="Error"
	args={{ title: "Open orders", state: "error", errorMessage: "Orders aggregate failed." }}
	template={statTemplate}
/>
