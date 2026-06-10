<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import ErrorState from "./ErrorState.svelte";

	const { Story } = defineMeta({
		title: "Components/ErrorState",
		component: ErrorState,
	});
</script>

{#snippet errorTemplate(args)}
	<ErrorState {...args} />
{/snippet}

<Story
	name="Error"
	args={{
		title: "Work feed unavailable",
		message: "The Hub API returned an unavailable response before work events loaded.",
		details: "GET /api/events?space=studio-ops -> 503",
		retryLabel: "Retry",
	}}
	template={errorTemplate}
/>
<Story
	name="Compact"
	args={{
		compact: true,
		title: "Metric failed",
		message: "The aggregate could not be calculated.",
	}}
	template={errorTemplate}
/>
