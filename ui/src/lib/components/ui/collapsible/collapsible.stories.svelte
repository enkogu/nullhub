<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button } from '../button/index.js';
	import * as Collapsible from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Collapsible',
		component: Collapsible.Collapsible,
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

{#snippet collapsibleTemplate(args)}
	<Collapsible.Root open={args.open} disabled={args.disabled} class="w-80 space-y-2">
		<Collapsible.Trigger>
			<Button variant="outline" size="sm">Advanced evidence settings</Button>
		</Collapsible.Trigger>
		<Collapsible.Content>
			<div class="rounded-md border px-3 py-2 text-sm text-muted-foreground">
				Require screenshots and API assertions before merge.
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
{/snippet}

<Story name="Closed" args={{ open: false, disabled: false }} template={collapsibleTemplate} />
<Story name="Open" args={{ open: true, disabled: false }} template={collapsibleTemplate} />
<Story name="Disabled" args={{ open: false, disabled: true }} template={collapsibleTemplate} />
