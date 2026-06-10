<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Button',
		component: Button,
		argTypes: {
			variant: {
				control: 'select',
				options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link']
			},
			size: {
				control: 'select',
				options: ['default', 'sm', 'lg', 'icon', 'icon-sm', 'icon-lg']
			},
			disabled: {
				control: 'boolean'
			}
		}
	});
</script>

{#snippet buttonTemplate(args)}
	<Button {...args}>Deploy agent</Button>
{/snippet}

{#snippet destructiveTemplate(args)}
	<Button {...args}>Delete workspace</Button>
{/snippet}

{#snippet linkTemplate(args)}
	<Button {...args} href="/work">Open work queue</Button>
{/snippet}

{#snippet iconTemplate(args)}
	<Button {...args} aria-label="Create order">
		<PlusIcon />
	</Button>
{/snippet}

<Story name="Default" args={{ variant: 'default', size: 'default', disabled: false }} template={buttonTemplate} />
<Story name="Secondary" args={{ variant: 'secondary', size: 'default', disabled: false }} template={buttonTemplate} />
<Story name="Outline" args={{ variant: 'outline', size: 'default', disabled: false }} template={buttonTemplate} />
<Story name="Destructive" args={{ variant: 'destructive', size: 'default', disabled: false }} template={destructiveTemplate} />
<Story name="Ghost Disabled" args={{ variant: 'ghost', size: 'default', disabled: true }} template={buttonTemplate} />
<Story name="Link" args={{ variant: 'link', size: 'default', disabled: false }} template={linkTemplate} />
<Story name="Small" args={{ variant: 'default', size: 'sm', disabled: false }} template={buttonTemplate} />
<Story name="Large" args={{ variant: 'default', size: 'lg', disabled: false }} template={buttonTemplate} />
<Story name="Icon" args={{ variant: 'secondary', size: 'icon', disabled: false }} template={iconTemplate} />
