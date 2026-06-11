<script lang="ts" module>
	export type CommandPaletteTaskInput = {
		instance: string;
		pipelineId: string;
		title: string;
		description: string;
		priority: number;
	};

	export type CommandPaletteCreateTask = (input: CommandPaletteTaskInput) => Promise<unknown> | unknown;
	export type CommandPaletteNavigate = (url: string) => Promise<void> | void;
</script>

<script lang="ts">
	import { goto } from "$app/navigation";
	import { api } from "$lib/api/client";
	import { appShellCommandSections } from "$lib/appShellNav";
	import { Button } from "$lib/components/ui/button";
	import * as Command from "$lib/components/ui/command/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Input } from "$lib/components/ui/input";
	import { Textarea } from "$lib/components/ui/textarea";
	import { getSelectedTicketsInstance } from "$lib/nullstack/backendSelection";
	import CirclePlusIcon from "@lucide/svelte/icons/circle-plus";
	import FolderPlusIcon from "@lucide/svelte/icons/folder-plus";
	import { tick } from "svelte";

	const DEFAULT_TICKETS_INSTANCE = "tickets";

	type PaletteMode = "commands" | "task";

	type Props = {
		open?: boolean;
		navigate?: CommandPaletteNavigate;
		createTask?: CommandPaletteCreateTask;
		onCreateSpace?: () => Promise<void> | void;
		ticketsInstance?: string;
	};

	let {
		open = $bindable(false),
		navigate = defaultNavigate,
		createTask = defaultCreateTask,
		onCreateSpace = () => {},
		ticketsInstance,
	}: Props = $props();

	let searchValue = $state("");
	let mode = $state<PaletteMode>("commands");
	let taskInstance = $state("");
	let taskPipelineId = $state("");
	let taskTitle = $state("");
	let taskDescription = $state("");
	let taskPriority = $state("0");
	let taskSubmitting = $state(false);
	let actionError = $state("");
	let actionMessage = $state("");
	let searchInput = $state<HTMLInputElement | null>(null);
	let taskPipelineInput = $state<HTMLInputElement | null>(null);

	let resolvedTicketsInstance = $derived(
		taskInstance.trim() || ticketsInstance?.trim() || getSelectedTicketsInstance() || DEFAULT_TICKETS_INSTANCE,
	);
	let canCreateTask = $derived(Boolean(taskPipelineId.trim() && taskTitle.trim() && !taskSubmitting));

	$effect(() => {
		if (!open) resetPalette();
	});

	$effect(() => {
		if (!open) return;
		const activeMode = mode;
		void focusModeInput(activeMode);
	});

	function resetPalette() {
		searchValue = "";
		mode = "commands";
		actionError = "";
		actionMessage = "";
		taskSubmitting = false;
	}

	async function defaultNavigate(url: string) {
		await goto(url);
	}

	async function defaultCreateTask(input: CommandPaletteTaskInput) {
		return api.nullTicketsCreateTask("nulltickets", input.instance, {
			pipeline_id: input.pipelineId,
			title: input.title,
			description: input.description,
			priority: input.priority,
			metadata: { source: "nullhub-ui" },
			assigned_by: "nullhub",
		});
	}

	async function focusModeInput(activeMode: PaletteMode) {
		await tick();
		if (!open || mode !== activeMode) return;
		if (activeMode === "commands") {
			searchInput?.focus();
		} else {
			taskPipelineInput?.focus();
		}
	}

	async function navigateTo(url: string) {
		await navigate(url);
		open = false;
	}

	function openTaskCapture() {
		mode = "task";
		searchValue = "";
		actionError = "";
		actionMessage = "";
		taskInstance = ticketsInstance?.trim() || getSelectedTicketsInstance() || DEFAULT_TICKETS_INSTANCE;
		void focusModeInput("task");
	}

	function returnToCommands() {
		mode = "commands";
		void focusModeInput("commands");
	}

	async function createSpaceFromPalette() {
		await onCreateSpace();
		open = false;
	}

	async function submitTask() {
		const pipelineId = taskPipelineId.trim();
		const title = taskTitle.trim();
		if (!pipelineId || !title) return;

		taskSubmitting = true;
		actionError = "";
		actionMessage = "";
		try {
			const priority = Number.parseInt(taskPriority || "0", 10);
			await createTask({
				instance: resolvedTicketsInstance,
				pipelineId,
				title,
				description: taskDescription.trim(),
				priority: Number.isFinite(priority) ? priority : 0,
			});
			taskTitle = "";
			taskDescription = "";
			actionMessage = "Task created.";
		} catch (error) {
			actionError = (error as Error).message || "Unable to create task.";
		} finally {
			taskSubmitting = false;
		}
	}
</script>

<Dialog.Root
	bind:open
	title="Command Palette"
	description={mode === "commands" ? "Search navigation and capture actions." : "Create a ticket-backed task."}
	class="overflow-hidden p-0"
>
	{#if mode === "commands"}
		<Command.Root bind:value={searchValue}>
			<Command.Input bind:ref={searchInput} aria-label="Command search" placeholder="Search commands..." />
			<Command.List aria-label="Command results" class="max-h-[440px]">
				<Command.Empty>No commands found.</Command.Empty>

				<Command.Group heading="Navigation">
					{#each appShellCommandSections as item (item.key)}
						<Command.Item value={`${item.key} ${item.title}`} keywords={item.keywords} onSelect={() => navigateTo(item.url)}>
							<span class="flex min-w-0 flex-col">
								<span class="font-medium">{item.title}</span>
								<span class="truncate text-xs text-muted-foreground">{item.detail}</span>
							</span>
							<Command.Shortcut>{item.shortcut}</Command.Shortcut>
						</Command.Item>
					{/each}
				</Command.Group>

				<Command.Separator />

				<Command.Group heading="Capture">
					<Command.Item value="new task capture ticket loop nulltickets" onSelect={openTaskCapture}>
						<CirclePlusIcon />
						<span class="flex min-w-0 flex-col">
							<span class="font-medium">New task</span>
							<span class="truncate text-xs text-muted-foreground">Capture work for a loop.</span>
						</span>
						<Command.Shortcut>N</Command.Shortcut>
					</Command.Item>
					<Command.Item value="new space workspace create switcher" onSelect={createSpaceFromPalette}>
						<FolderPlusIcon />
						<span class="flex min-w-0 flex-col">
							<span class="font-medium">New space</span>
							<span class="truncate text-xs text-muted-foreground">Create a scoped workspace.</span>
						</span>
						<Command.Shortcut>Space</Command.Shortcut>
					</Command.Item>
				</Command.Group>

				<Command.Separator />

				<Command.Group heading="Search">
					<Command.Item value="search orders loops workflows tickets" disabled>
						<span class="flex min-w-0 flex-col">
							<span class="font-medium">Search orders</span>
							<span class="truncate text-xs text-muted-foreground">Orders index is not connected yet.</span>
						</span>
					</Command.Item>
					<Command.Item value="search agents team roles skills" disabled>
						<span class="flex min-w-0 flex-col">
							<span class="font-medium">Search agents</span>
							<span class="truncate text-xs text-muted-foreground">Agent index is not connected yet.</span>
						</span>
					</Command.Item>
				</Command.Group>
			</Command.List>
		</Command.Root>
	{:else}
		<form class="grid gap-3" onsubmit={(event) => { event.preventDefault(); void submitTask(); }}>
			<div class="grid gap-1.5">
				<label class="text-sm font-medium" for="command-task-instance">Tickets instance</label>
				<Input id="command-task-instance" bind:value={taskInstance} placeholder={DEFAULT_TICKETS_INSTANCE} />
			</div>
			<div class="grid gap-1.5">
				<label class="text-sm font-medium" for="command-task-pipeline">Loop ID</label>
				<Input bind:ref={taskPipelineInput} id="command-task-pipeline" bind:value={taskPipelineId} placeholder="loop-id" required />
			</div>
			<div class="grid gap-1.5">
				<label class="text-sm font-medium" for="command-task-title">Title</label>
				<Input id="command-task-title" bind:value={taskTitle} placeholder="Task title" required />
			</div>
			<div class="grid gap-1.5">
				<label class="text-sm font-medium" for="command-task-description">Description</label>
				<Textarea id="command-task-description" bind:value={taskDescription} rows={3} />
			</div>
			<div class="grid gap-1.5">
				<label class="text-sm font-medium" for="command-task-priority">Priority</label>
				<Input id="command-task-priority" bind:value={taskPriority} inputmode="numeric" />
			</div>
			{#if actionError}
				<p class="text-sm text-destructive" role="alert">{actionError}</p>
			{:else if actionMessage}
				<p class="text-sm text-muted-foreground" role="status">{actionMessage}</p>
			{/if}
			<div class="flex items-center justify-between gap-2">
				<Button type="button" variant="ghost" onclick={returnToCommands}>Back</Button>
				<Button type="submit" disabled={!canCreateTask}>{taskSubmitting ? "Creating..." : "Create task"}</Button>
			</div>
		</form>
	{/if}
</Dialog.Root>
