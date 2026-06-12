<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import FeedbackDialog from "./FeedbackDialog.svelte";

	const { Story } = defineMeta({
		title: "Inbox/FeedbackDialog",
		component: FeedbackDialog,
	});
</script>

{#snippet dialogTemplate(args)}
	<FeedbackDialog {...args} />
{/snippet}

<Story name="Closed" args={{ open: false }} template={dialogTemplate} />
<Story name="Open" args={{ open: true }} template={dialogTemplate} />
<Story name="Submitting" args={{ open: true, loading: true }} template={dialogTemplate} />
