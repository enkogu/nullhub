<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { ScrollArea } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Scroll Area',
		component: ScrollArea,
		argTypes: {
			orientation: {
				control: 'select',
				options: ['vertical', 'horizontal', 'both']
			}
		}
	});
</script>

{#snippet scrollAreaTemplate(args)}
	<ScrollArea {...args} class="h-32 w-72 rounded-md border">
		<div class="space-y-3 p-4">
			{#each ['Inbox sweep', 'Provider audit', 'Daily report', 'Lead triage', 'Evidence export'] as item}
				<div class="text-sm">
					<p class="font-medium">{item}</p>
					<p class="text-muted-foreground">Scheduled loop ready for review.</p>
				</div>
			{/each}
		</div>
	</ScrollArea>
{/snippet}

<Story name="Vertical" args={{ orientation: 'vertical' }} template={scrollAreaTemplate} />
<Story name="Horizontal" args={{ orientation: 'horizontal' }} template={scrollAreaTemplate} />
<Story name="Both" args={{ orientation: 'both' }} template={scrollAreaTemplate} />
