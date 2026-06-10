<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PopoverFixture from './popover.fixture.svelte';

	const { Story } = defineMeta({
		title: 'UI/Popover',
		component: PopoverFixture,
		argTypes: {
			open: {
				control: 'boolean'
			},
			disabled: {
				control: 'boolean'
			}
		}
	});
</script>

{#snippet popoverTemplate(args)}
	<div class="flex min-h-44 items-start justify-center p-8">
		<PopoverFixture {...args} />
	</div>
{/snippet}

<Story name="Closed" args={{ open: false, disabled: false }} template={popoverTemplate} />
<Story name="Open" args={{ open: true, disabled: false }} template={popoverTemplate} />
<Story name="Disabled Trigger" args={{ open: false, disabled: true }} template={popoverTemplate} />
