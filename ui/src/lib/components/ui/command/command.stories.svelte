<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CommandFixture from './command.fixture.svelte';

	const { Story } = defineMeta({
		title: 'UI/Command',
		component: CommandFixture,
		argTypes: {
			value: {
				control: 'text'
			}
		}
	});
</script>

{#snippet commandTemplate(args)}
	<CommandFixture value={args.value} />
{/snippet}

<Story name="Default" args={{ value: '' }} template={commandTemplate} />
<Story name="Filtered" args={{ value: 'orders' }} template={commandTemplate} />
<Story name="Empty" args={{ value: 'billing' }} template={commandTemplate} />
