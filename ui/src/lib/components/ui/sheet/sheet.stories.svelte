<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button } from '../button/index.js';
	import * as Sheet from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Sheet',
		component: Sheet.Sheet,
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

{#snippet closedTemplate(args)}
	<Sheet.Root open={args.open}>
		<Sheet.Trigger>
			<Button variant="outline">Open system drawer</Button>
		</Sheet.Trigger>
		<Sheet.Content side={args.side}>
			<Sheet.Header>
				<Sheet.Title>System drawer</Sheet.Title>
				<Sheet.Description>Provider and channel settings.</Sheet.Description>
			</Sheet.Header>
			<div class="px-4 text-sm text-muted-foreground">Drawer body</div>
		</Sheet.Content>
	</Sheet.Root>
{/snippet}

{#snippet openTemplate(args)}
	<div class="min-h-64 w-80">
		<Sheet.Root open={args.open}>
			<Sheet.Content side={args.side}>
				<Sheet.Header>
					<Sheet.Title>Order details</Sheet.Title>
					<Sheet.Description>Review schedule, policy, and evidence requirements.</Sheet.Description>
				</Sheet.Header>
				<div class="px-4 text-sm text-muted-foreground">Runs every weekday at 09:00.</div>
				<Sheet.Footer>
					<Button size="sm">Save order</Button>
					<Button variant="outline" size="sm">Cancel</Button>
				</Sheet.Footer>
			</Sheet.Content>
		</Sheet.Root>
	</div>
{/snippet}

<Story name="Closed Trigger" args={{ open: false, side: 'right' }} template={closedTemplate} />
<Story name="Open Right" args={{ open: true, side: 'right' }} template={openTemplate} />
<Story name="Open Left" args={{ open: true, side: 'left' }} template={openTemplate} />
<Story name="Open Bottom" args={{ open: true, side: 'bottom' }} template={openTemplate} />
