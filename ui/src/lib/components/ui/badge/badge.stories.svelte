<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Badge } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Badge',
		component: Badge,
		argTypes: {
			variant: {
				control: 'select',
				options: ['default', 'secondary', 'outline', 'success', 'warning', 'destructive', 'muted']
			}
		}
	});
</script>

{#snippet badgeTemplate(args)}
	<Badge {...args}>{args.label}</Badge>
{/snippet}

<Story name="Default" args={{ variant: 'default', label: 'Live' }} template={badgeTemplate} />
<Story name="Secondary" args={{ variant: 'secondary', label: 'Queued' }} template={badgeTemplate} />
<Story name="Outline" args={{ variant: 'outline', label: 'Draft' }} template={badgeTemplate} />
<Story name="Success" args={{ variant: 'success', label: 'Synced' }} template={badgeTemplate} />
<Story name="Warning" args={{ variant: 'warning', label: 'Needs review' }} template={badgeTemplate} />
<Story name="Destructive" args={{ variant: 'destructive', label: 'Failed' }} template={badgeTemplate} />
<Story name="Muted" args={{ variant: 'muted', label: 'Paused' }} template={badgeTemplate} />
