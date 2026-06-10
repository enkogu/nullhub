<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Checkbox } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Checkbox',
		component: Checkbox,
		argTypes: {
			checked: {
				control: 'boolean'
			},
			indeterminate: {
				control: 'boolean'
			},
			disabled: {
				control: 'boolean'
			}
		}
	});
</script>

{#snippet checkboxTemplate(args)}
	<label class="flex items-center gap-3 text-sm">
		<Checkbox {...args} aria-label="Include evidence" />
		<span class="text-muted-foreground">
			{args.indeterminate ? 'Some evidence selected' : args.checked ? 'Evidence included' : 'Include evidence'}
		</span>
	</label>
{/snippet}

<Story name="Unchecked" args={{ checked: false, indeterminate: false, disabled: false }} template={checkboxTemplate} />
<Story name="Checked" args={{ checked: true, indeterminate: false, disabled: false }} template={checkboxTemplate} />
<Story name="Indeterminate" args={{ checked: false, indeterminate: true, disabled: false }} template={checkboxTemplate} />
<Story name="Disabled" args={{ checked: false, indeterminate: false, disabled: true }} template={checkboxTemplate} />
