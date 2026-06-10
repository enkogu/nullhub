<script lang="ts">
	import * as Command from './index.js';

	type CommandEntry = {
		value: string;
		label: string;
		detail: string;
		shortcut: string;
	};

	const navigationItems: CommandEntry[] = [
		{
			value: 'home',
			label: 'Home',
			detail: 'Review current state, risks, and recent evidence.',
			shortcut: 'H'
		},
		{
			value: 'inbox',
			label: 'Inbox',
			detail: 'Resolve approvals, requests, and unresolved inputs.',
			shortcut: 'I'
		},
		{
			value: 'work',
			label: 'Work',
			detail: 'Supervise live runs, results, and artifacts.',
			shortcut: 'W'
		}
	];

	const orderItems: CommandEntry[] = [
		{
			value: 'orders',
			label: 'Orders',
			detail: 'Open tickets, loops, and workflows.',
			shortcut: 'O'
		},
		{
			value: 'team',
			label: 'Team',
			detail: 'Manage agents, instances, skills, and roles.',
			shortcut: 'T'
		},
		{
			value: 'system',
			label: 'System',
			detail: 'Inspect providers, channels, usage, and settings.',
			shortcut: 'S'
		}
	];

	let { value = $bindable('') }: { value?: string } = $props();
</script>

<Command.Root bind:value class="w-96 rounded-lg border bg-popover shadow-md">
	<Command.Input aria-label="Command search" placeholder="Search commands..." />
	<Command.List aria-label="Command results">
		<Command.Empty>No commands found.</Command.Empty>

		<Command.Group heading="Navigation">
			{#each navigationItems as item (item.value)}
				<Command.Item value={item.value}>
					<span class="flex min-w-0 flex-col">
						<span class="font-medium">{item.label}</span>
						<span class="truncate text-xs text-muted-foreground">{item.detail}</span>
					</span>
					<Command.Shortcut>{item.shortcut}</Command.Shortcut>
				</Command.Item>
			{/each}
		</Command.Group>

		<Command.Separator />

		<Command.Group heading="Operations">
			{#each orderItems as item (item.value)}
				<Command.Item value={item.value}>
					<span class="flex min-w-0 flex-col">
						<span class="font-medium">{item.label}</span>
						<span class="truncate text-xs text-muted-foreground">{item.detail}</span>
					</span>
					<Command.Shortcut>{item.shortcut}</Command.Shortcut>
				</Command.Item>
			{/each}
		</Command.Group>
	</Command.List>
</Command.Root>
