<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import CountBadge from "./CountBadge.svelte";

	const { Story } = defineMeta({
		title: "Components/CountBadge",
		component: CountBadge,
	});
</script>

{#snippet populatedTemplate()}
	<div class="flex flex-wrap gap-2">
		<CountBadge count={18} label="orders" tone="neutral" />
		<CountBadge count={4} label="ready" tone="ok" />
		<CountBadge count={7} label="review" tone="watch" />
		<CountBadge count={2} label="blocked" tone="risk" />
	</div>
{/snippet}

{#snippet loadingTemplate()}
	<CountBadge loading label="results" tone="primary" />
{/snippet}

<Story name="Populated" template={populatedTemplate} />
<Story name="Loading" template={loadingTemplate} />
