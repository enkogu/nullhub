<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as Tabs from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Tabs',
		component: Tabs.Tabs,
		argTypes: {
			value: {
				control: 'select',
				options: ['loops', 'workflows', 'policies']
			}
		}
	});
</script>

{#snippet tabsTemplate(args)}
	<Tabs.Root value={args.value} class="w-96">
		<Tabs.List>
			<Tabs.Trigger value="loops">Loops</Tabs.Trigger>
			<Tabs.Trigger value="workflows">Workflows</Tabs.Trigger>
			<Tabs.Trigger value="policies">Policies</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="loops">
			<p class="text-sm text-muted-foreground">Ticket-backed repeatable agent work.</p>
		</Tabs.Content>
		<Tabs.Content value="workflows">
			<p class="text-sm text-muted-foreground">Graph-backed orchestration and checkpoints.</p>
		</Tabs.Content>
		<Tabs.Content value="policies">
			<p class="text-sm text-muted-foreground">Schedules, limits, and approval rules.</p>
		</Tabs.Content>
	</Tabs.Root>
{/snippet}

<Story name="Loops Active" args={{ value: 'loops' }} template={tabsTemplate} />
<Story name="Workflows Active" args={{ value: 'workflows' }} template={tabsTemplate} />
<Story name="Policies Active" args={{ value: 'policies' }} template={tabsTemplate} />
