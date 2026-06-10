<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import * as Alert from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Alert',
		component: Alert.Root,
		argTypes: {
			variant: {
				control: 'select',
				options: ['default', 'destructive']
			}
		}
	});
</script>

{#snippet alertTemplate(args)}
	<Alert.Root variant={args.variant}>
		<TriangleAlertIcon />
		<Alert.Title>{args.variant === 'destructive' ? 'Provider key failed' : 'Loop scheduled'}</Alert.Title>
		<Alert.Description>
			{args.variant === 'destructive'
				? 'OpenRouter rejected the active key. Review System settings before retrying.'
				: 'The weekday inbox sweep will start at 09:00 in the selected Space.'}
		</Alert.Description>
	</Alert.Root>
{/snippet}

{#snippet alertActionTemplate(args)}
	<Alert.Root variant={args.variant}>
		<TriangleAlertIcon />
		<Alert.Title>Provider key failed</Alert.Title>
		<Alert.Description>OpenRouter rejected the active key. Review System settings before retrying.</Alert.Description>
		<Alert.Action>
			<button class="rounded-md border px-2 py-1 text-xs" type="button">Review</button>
		</Alert.Action>
	</Alert.Root>
{/snippet}

<Story name="Default" args={{ variant: 'default' }} template={alertTemplate} />
<Story name="Destructive" args={{ variant: 'destructive' }} template={alertTemplate} />
<Story name="With Action" args={{ variant: 'default' }} template={alertActionTemplate} />
