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

{#snippet liveTemplate(args)}
	<Badge {...args}>Live</Badge>
{/snippet}

{#snippet queuedTemplate(args)}
	<Badge {...args}>Queued</Badge>
{/snippet}

{#snippet draftTemplate(args)}
	<Badge {...args}>Draft</Badge>
{/snippet}

{#snippet syncedTemplate(args)}
	<Badge {...args}>Synced</Badge>
{/snippet}

{#snippet reviewTemplate(args)}
	<Badge {...args}>Needs review</Badge>
{/snippet}

{#snippet failedTemplate(args)}
	<Badge {...args}>Failed</Badge>
{/snippet}

{#snippet pausedTemplate(args)}
	<Badge {...args}>Paused</Badge>
{/snippet}

<Story name="Default" args={{ variant: 'default' }} template={liveTemplate} />
<Story name="Secondary" args={{ variant: 'secondary' }} template={queuedTemplate} />
<Story name="Outline" args={{ variant: 'outline' }} template={draftTemplate} />
<Story name="Success" args={{ variant: 'success' }} template={syncedTemplate} />
<Story name="Warning" args={{ variant: 'warning' }} template={reviewTemplate} />
<Story name="Destructive" args={{ variant: 'destructive' }} template={failedTemplate} />
<Story name="Muted" args={{ variant: 'muted' }} template={pausedTemplate} />
