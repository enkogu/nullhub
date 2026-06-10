<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Separator } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Separator',
		component: Separator,
		argTypes: {
			orientation: {
				control: 'select',
				options: ['horizontal', 'vertical']
			},
			decorative: {
				control: 'boolean'
			}
		}
	});
</script>

{#snippet horizontalTemplate(args)}
	<div class="w-72 space-y-3">
		<p class="text-sm font-medium">Orders</p>
		<Separator {...args} />
		<p class="text-sm text-muted-foreground">Scheduled loops and workflow starts</p>
	</div>
{/snippet}

{#snippet verticalTemplate(args)}
	<div class="flex h-16 items-center gap-4">
		<span class="text-sm font-medium">Home</span>
		<Separator {...args} />
		<span class="text-sm font-medium">Work</span>
		<Separator {...args} />
		<span class="text-sm font-medium">System</span>
	</div>
{/snippet}

<Story name="Horizontal" args={{ orientation: 'horizontal', decorative: true }} template={horizontalTemplate} />
<Story name="Vertical" args={{ orientation: 'vertical', decorative: true }} template={verticalTemplate} />
<Story name="Semantic" args={{ orientation: 'horizontal', decorative: false }} template={horizontalTemplate} />
