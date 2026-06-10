<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button } from '../button/index.js';
	import { Select } from '../select/index.js';
	import { PageHeader } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Page Header',
		component: PageHeader,
		argTypes: {
			align: {
				control: 'select',
				options: ['center', 'start']
			}
		}
	});
</script>

{#snippet controls()}
	<Select aria-label="Surface" value="work" class="w-36">
		<option value="home">Home</option>
		<option value="work">Work</option>
		<option value="orders">Orders</option>
	</Select>
{/snippet}

{#snippet actions()}
	<Button variant="secondary" size="sm">Refresh</Button>
	<Button size="sm">New order</Button>
{/snippet}

{#snippet defaultTemplate(args)}
	<PageHeader {...args} />
{/snippet}

{#snippet controlsTemplate(args)}
	<PageHeader {...args} controls={controls} actions={actions} />
{/snippet}

<Story
	name="Default"
	args={{
		title: 'Work',
		subtitle: 'Live runs, evidence, and review queues',
		align: 'center'
	}}
	template={defaultTemplate}
/>
<Story
	name="With Controls"
	args={{
		title: 'Orders',
		subtitle: 'Durable instructions and scheduled loops',
		align: 'center'
	}}
	template={controlsTemplate}
/>
<Story
	name="Start Aligned"
	args={{
		title: 'System',
		subtitle: 'Providers, channels, usage, and observability',
		align: 'start'
	}}
	template={controlsTemplate}
/>
<Story
	name="Title Only"
	args={{
		title: 'Team',
		subtitle: '',
		align: 'center'
	}}
	template={defaultTemplate}
/>
