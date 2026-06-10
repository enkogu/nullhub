<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button } from '../button/index.js';
	import { Dialog } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Dialog',
		component: Dialog,
		argTypes: {
			open: {
				control: 'boolean'
			},
			size: {
				control: 'select',
				options: ['sm', 'md', 'lg']
			}
		}
	});
</script>

{#snippet body()}
	<p>Review required secrets and runtime changes before installing this kit.</p>
{/snippet}

{#snippet footer()}
	<Button variant="outline" size="sm">Cancel</Button>
	<Button size="sm">Install kit</Button>
{/snippet}

{#snippet dialogTemplate(args)}
	<Dialog {...args} title={args.title} description={args.description} footer={footer}>
		{@render body()}
	</Dialog>
{/snippet}

<Story
	name="Closed"
	args={{ open: false, title: 'Install kit', description: 'No modal is visible.', size: 'md' }}
	template={dialogTemplate}
/>
<Story
	name="Open"
	args={{ open: true, title: 'Install kit', description: 'Confirm the blast radius.', size: 'md' }}
	template={dialogTemplate}
/>
<Story
	name="Large"
	args={{ open: true, title: 'Review workflow', description: 'Inspect generated steps.', size: 'lg' }}
	template={dialogTemplate}
/>
