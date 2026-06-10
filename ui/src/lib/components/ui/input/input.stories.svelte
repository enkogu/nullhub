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
	<Input {...args} aria-label={args.label} class="w-72" />
{/snippet}

<Story
	name="Text"
	args={{ type: 'text', label: 'Order name', value: 'Daily inbox triage', disabled: false }}
	template={inputTemplate}
/>
<Story
	name="Search"
	args={{ type: 'search', label: 'Search work', placeholder: 'Find runs', disabled: false }}
	template={inputTemplate}
/>
<Story
	name="Invalid"
	args={{ type: 'email', label: 'Provider email', value: 'not-an-email', 'aria-invalid': true }}
	template={inputTemplate}
/>
<Story
	name="Disabled"
	args={{ type: 'text', label: 'Locked space', value: 'Personal', disabled: true }}
	template={inputTemplate}
/>
<Story
	name="File"
	args={{ type: 'file', label: 'Evidence upload', disabled: false }}
	template={inputTemplate}
/>
