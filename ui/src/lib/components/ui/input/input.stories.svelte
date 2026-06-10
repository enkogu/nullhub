<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Input } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Input',
		component: Input,
		argTypes: {
			type: {
				control: 'select',
				options: ['text', 'search', 'email', 'file']
			},
			disabled: {
				control: 'boolean'
			},
			'aria-invalid': {
				control: 'boolean'
			}
		}
	});
</script>

{#snippet inputTemplate(args)}
	<Input {...args} class="w-72" />
{/snippet}

<Story
	name="Text"
	args={{ type: 'text', 'aria-label': 'Order name', value: 'Daily inbox triage', disabled: false }}
	template={inputTemplate}
/>
<Story
	name="Search"
	args={{ type: 'search', 'aria-label': 'Search work', placeholder: 'Find runs', disabled: false }}
	template={inputTemplate}
/>
<Story
	name="Invalid"
	args={{ type: 'email', 'aria-label': 'Provider email', value: 'not-an-email', 'aria-invalid': true }}
	template={inputTemplate}
/>
<Story
	name="Disabled"
	args={{ type: 'text', 'aria-label': 'Locked space', value: 'Personal', disabled: true }}
	template={inputTemplate}
/>
<Story
	name="File"
	args={{ type: 'file', 'aria-label': 'Evidence upload', disabled: false }}
	template={inputTemplate}
/>
