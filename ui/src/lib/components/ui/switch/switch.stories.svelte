<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Switch } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Switch',
		component: Switch,
		argTypes: {
			checked: {
				control: 'boolean'
			},
			disabled: {
				control: 'boolean'
			}
		}
	});
</script>

{#snippet switchTemplate(args)}
	<div class="flex items-center gap-3">
		<Switch {...args} aria-label="Autonomy enabled" />
		<span class="text-sm text-muted-foreground">
			{args.checked ? 'Enabled' : 'Disabled'}
		</span>
	</div>
{/snippet}

<Story name="Off" args={{ checked: false, disabled: false }} template={switchTemplate} />
<Story name="On" args={{ checked: true, disabled: false }} template={switchTemplate} />
<Story name="Disabled" args={{ checked: false, disabled: true }} template={switchTemplate} />
