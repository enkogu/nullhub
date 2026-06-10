<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import EntityChip from "./EntityChip.svelte";

	const { Story } = defineMeta({
		title: "Components/EntityChip",
		component: EntityChip,
	});
</script>

{#snippet populatedTemplate()}
	<div class="flex flex-wrap gap-2">
		<EntityChip label="Studio Ops" kind="Space" href="/team?space=studio-ops" status="running" selected />
		<EntityChip label="Order intake" kind="Loop" href="/orders?space=studio-ops" status="queued" />
		<EntityChip label="Provider routing" kind="System" href="/system/providers" status="watch" />
	</div>
{/snippet}

{#snippet disabledTemplate()}
	<EntityChip label="Billing exports" kind="Report" status="stopped" disabled />
{/snippet}

<Story name="Populated" template={populatedTemplate} />
<Story name="Disabled" template={disabledTemplate} />
