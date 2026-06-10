<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import StatusDot from "./StatusDot.svelte";

	const { Story } = defineMeta({
		title: "Components/StatusDot",
		component: StatusDot,
	});
</script>

{#snippet statusTemplate(args)}
	<div class="flex flex-wrap gap-4">
		<StatusDot {...args} status="running" label="Running" />
		<StatusDot {...args} status="queued" label="Queued" />
		<StatusDot {...args} status="failed" label="Failed" />
		<StatusDot {...args} status="stopped" label="Stopped" />
	</div>
{/snippet}

{#snippet dotOnlyTemplate(args)}
	<div class="flex items-center gap-3">
		<StatusDot {...args} status="running" label="Running" showLabel={false} />
		<StatusDot {...args} status="watch" label="Watch" showLabel={false} />
		<StatusDot {...args} status="risk" label="Risk" showLabel={false} />
	</div>
{/snippet}

<Story name="Populated" template={statusTemplate} args={{ size: "md" }} />
<Story name="Dot Only" template={dotOnlyTemplate} args={{ size: "lg" }} />
