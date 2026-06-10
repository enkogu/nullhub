<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import FilterBar from "./FilterBar.svelte";

	const { Story } = defineMeta({
		title: "Components/FilterBar",
		component: FilterBar,
	});

	const filters = [
		{
			key: "status",
			label: "Status",
			value: "open",
			options: [
				{ label: "Open", value: "open" },
				{ label: "Ready", value: "ready" },
				{ label: "Blocked", value: "blocked" },
			],
		},
		{
			key: "surface",
			label: "Surface",
			options: [
				{ label: "Work", value: "work" },
				{ label: "Orders", value: "orders" },
				{ label: "System", value: "system" },
			],
		},
	];
</script>

{#snippet filterTemplate(args)}
	<FilterBar {...args} />
{/snippet}

<Story
	name="Populated"
	args={{
		query: "approval",
		searchPlaceholder: "Search work",
		filters,
		resultCount: 12,
	}}
	template={filterTemplate}
/>
<Story name="Loading" args={{ state: "loading" }} template={filterTemplate} />
<Story name="Empty" args={{ state: "empty" }} template={filterTemplate} />
<Story name="Error" args={{ state: "error", errorMessage: "Filter metadata failed." }} template={filterTemplate} />
