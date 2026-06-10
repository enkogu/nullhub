<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import RadioGroupFixture from './radio-group.fixture.svelte';

	const { Story } = defineMeta({
		title: 'UI/Radio Group',
		component: RadioGroupFixture,
		argTypes: {
			value: {
				control: 'select',
				options: ['loops', 'workflows']
			},
			disabled: {
				control: 'boolean'
			}
		}
	});
</script>

{#snippet radioGroupTemplate(args)}
	<RadioGroupFixture {...args} />
{/snippet}

<Story name="Loops Selected" args={{ value: 'loops', disabled: false }} template={radioGroupTemplate} />
<Story name="Workflows Selected" args={{ value: 'workflows', disabled: false }} template={radioGroupTemplate} />
<Story name="Disabled" args={{ value: 'loops', disabled: true }} template={radioGroupTemplate} />
