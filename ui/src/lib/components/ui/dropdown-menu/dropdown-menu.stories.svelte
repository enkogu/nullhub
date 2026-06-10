<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button } from '../button/index.js';
	import * as DropdownMenu from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Dropdown Menu',
		component: DropdownMenu.DropdownMenu,
		argTypes: {
			open: {
				control: 'boolean'
			}
		}
	});
</script>

{#snippet defaultTemplate(args)}
	<DropdownMenu.Root open={args.open}>
		<DropdownMenu.Trigger>
			<Button variant="outline">Open menu</Button>
		</DropdownMenu.Trigger>
		<DropdownMenu.Content>
			<DropdownMenu.Label>Work actions</DropdownMenu.Label>
			<DropdownMenu.Item>Open run</DropdownMenu.Item>
			<DropdownMenu.Item>
				Copy link
				<DropdownMenu.Shortcut>⌘C</DropdownMenu.Shortcut>
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item variant="destructive">Cancel run</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

{#snippet selectionTemplate(args)}
	<DropdownMenu.Root open={args.open}>
		<DropdownMenu.Trigger>
			<Button variant="outline">Evidence filters</Button>
		</DropdownMenu.Trigger>
		<DropdownMenu.Content>
			<DropdownMenu.CheckboxGroup value={['screenshots']}>
				<DropdownMenu.CheckboxItem value="screenshots" checked>Screenshots</DropdownMenu.CheckboxItem>
				<DropdownMenu.CheckboxItem value="api">API assertions</DropdownMenu.CheckboxItem>
			</DropdownMenu.CheckboxGroup>
			<DropdownMenu.Separator />
			<DropdownMenu.RadioGroup value="work">
				<DropdownMenu.RadioItem value="work">Work</DropdownMenu.RadioItem>
				<DropdownMenu.RadioItem value="orders">Orders</DropdownMenu.RadioItem>
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

<Story name="Closed Trigger" args={{ open: false }} template={defaultTemplate} />
<Story name="Open Actions" args={{ open: true }} template={defaultTemplate} />
<Story name="Open Selection" args={{ open: true }} template={selectionTemplate} />
