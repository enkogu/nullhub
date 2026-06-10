<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Select } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Select',
		component: Select,
		argTypes: {
			value: {
				control: 'select',
				options: ['', 'home', 'work', 'orders']
			},
			disabled: {
				control: 'boolean'
			}
		}
	});
</script>

{#snippet selectTemplate(args)}
	<Select {...args} aria-label="Surface">
		<option value="">Choose a surface</option>
		<option value="home">Home</option>
		<option value="work">Work</option>
		<option value="orders">Orders</option>
	</Select>
{/snippet}

<Story name="Placeholder" args={{ value: '', disabled: false, class: 'w-56' }} template={selectTemplate} />
<Story name="Selected" args={{ value: 'work', disabled: false, class: 'w-56' }} template={selectTemplate} />
<Story name="Disabled" args={{ value: 'orders', disabled: true, class: 'w-56' }} template={selectTemplate} />
