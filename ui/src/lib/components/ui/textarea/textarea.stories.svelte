<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Textarea } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Textarea',
		component: Textarea,
		argTypes: {
			value: {
				control: 'text'
			},
			disabled: {
				control: 'boolean'
			}
		}
	});
</script>

{#snippet textareaTemplate(args)}
	<Textarea {...args} aria-label="Order notes" class="w-80" />
{/snippet}

<Story
	name="Empty"
	args={{ value: '', placeholder: 'Add review instructions...', disabled: false }}
	template={textareaTemplate}
/>
<Story
	name="With Value"
	args={{ value: 'Escalate if no evidence is attached after the run.', disabled: false }}
	template={textareaTemplate}
/>
<Story
	name="Disabled"
	args={{ value: 'Managed by installed blueprint.', disabled: true }}
	template={textareaTemplate}
/>
