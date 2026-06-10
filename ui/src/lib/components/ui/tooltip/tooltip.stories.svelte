<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button } from '../button/index.js';
	import * as Tooltip from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Tooltip',
		component: Tooltip.Tooltip,
		argTypes: {
			side: {
				control: 'select',
				options: ['top', 'right', 'bottom', 'left']
			},
			open: {
				control: 'boolean'
			}
		}
	});
</script>

{#snippet tooltipTemplate(args)}
	<Tooltip.Provider delayDuration={0}>
		<Tooltip.Root open={args.open}>
			<Tooltip.Trigger>
				<Button variant="outline">Hover for evidence rule</Button>
			</Tooltip.Trigger>
			<Tooltip.Content side={args.side} sideOffset={8}>
				Attach runnable evidence before merge.
			</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
{/snippet}

<Story name="Open Top" args={{ open: true, side: 'top' }} template={tooltipTemplate} />
<Story name="Open Right" args={{ open: true, side: 'right' }} template={tooltipTemplate} />
<Story name="Open Bottom" args={{ open: true, side: 'bottom' }} template={tooltipTemplate} />
<Story name="Closed" args={{ open: false, side: 'top' }} template={tooltipTemplate} />
