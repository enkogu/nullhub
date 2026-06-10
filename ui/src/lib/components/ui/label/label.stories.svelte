<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Input } from '../input/index.js';
	import { Label } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Label',
		component: Label
	});
</script>

{#snippet labelTemplate()}
	<Label for="order-name">Order name</Label>
{/snippet}

{#snippet withInputTemplate()}
	<div class="grid w-72 gap-2">
		<Label for="provider-key">Provider key</Label>
		<Input id="provider-key" placeholder="sk-..." />
	</div>
{/snippet}

{#snippet requiredTemplate()}
	<Label for="space-name">
		Space name
		<span aria-hidden="true" class="text-destructive">*</span>
	</Label>
{/snippet}

<Story name="Default" template={labelTemplate} />
<Story name="With Input" template={withInputTemplate} />
<Story name="Required" template={requiredTemplate} />
