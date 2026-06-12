<script lang="ts" module>
	export type SpaceSwitcherState = "idle" | "loading" | "ready" | "error";
</script>

<script lang="ts">
	import Building2Icon from "@lucide/svelte/icons/building-2";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import Globe2Icon from "@lucide/svelte/icons/globe-2";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { onMount } from "svelte";
	import { spacesApi, type SpaceSelection, type SpacesApi } from "$lib/api/client";
	import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
	import SpaceOverviewRow, { type SpaceOverviewRowModel } from "$lib/components/SpaceOverviewRow.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import { cn } from "$lib/utils.js";

	let {
		api = spacesApi,
		rows,
		state: stateProp = rows ? "ready" : "idle",
		error = null,
		selectedSpaceId = null,
		defaultOpen = false,
		usageWindow = "7d",
		onSelectSpace,
		onSelectAll,
		onCreateSpace,
		class: className,
	}: {
		api?: SpacesApi;
		rows?: SpaceOverviewRowModel[];
		state?: SpaceSwitcherState;
		error?: unknown;
		selectedSpaceId?: SpaceSelection;
		defaultOpen?: boolean;
		usageWindow?: "24h" | "7d" | "30d" | "all";
		onSelectSpace?: (spaceId: string) => void;
		onSelectAll?: () => void;
		onCreateSpace?: () => void;
		class?: string;
	} = $props();

	let open = $state(false);
	let localRows = $state<SpaceOverviewRowModel[]>([]);
	let localState = $state<SpaceSwitcherState>("idle");
	let localError = $state<unknown>(null);
	let localSelectedSpaceId = $state<SpaceSelection>(null);
	let selectedRow = $derived(localRows.find((row) => row.space.id === localSelectedSpaceId) ?? null);
	let triggerTitle = $derived(selectedRow?.space.name ?? "All spaces");
	let triggerDetail = $derived(selectedRow ? `${selectedRow.aggregate.pendingCount} pending` : `${localRows.length} spaces`);
	let isLoading = $derived(localState === "idle" || localState === "loading");
	let dataState = $derived(
		(isLoading ? "loading" : localState === "error" ? "error" : localRows.length ? "populated" : "empty") as DataStateKind,
	);

	$effect(() => {
		if (rows) localRows = rows;
	});

	$effect(() => {
		localState = stateProp;
		localError = error;
	});

	$effect(() => {
		localSelectedSpaceId = selectedSpaceId;
	});

	$effect(() => {
		open = defaultOpen;
	});

	async function loadOverviews() {
		localState = "loading";
		localError = null;
		try {
			localRows = await api.listSpaceOverviews({ usageWindow });
			localState = "ready";
		} catch (caught) {
			localState = "error";
			localError = caught;
		}
	}

	function selectAll() {
		localSelectedSpaceId = null;
		onSelectAll?.();
	}

	function selectSpace(spaceId: string) {
		localSelectedSpaceId = spaceId;
		onSelectSpace?.(spaceId);
	}

	onMount(() => {
		if (!rows) void loadOverviews();
	});
</script>

<div data-slot="space-switcher" class={cn("min-w-0", className)}>
	<DropdownMenu.Root bind:open>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					class="h-auto w-full justify-start gap-2 rounded-lg border bg-sidebar px-2 py-2 text-start data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
					aria-label="Switch Space"
				>
					<span class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
						{#if localSelectedSpaceId}
							<Building2Icon class="size-4" aria-hidden="true" />
						{:else}
							<Globe2Icon class="size-4" aria-hidden="true" />
						{/if}
					</span>
					<span class="grid min-w-0 flex-1 text-sm leading-tight">
						<span class="truncate font-medium">{triggerTitle}</span>
						<span class="truncate text-xs text-muted-foreground">{triggerDetail}</span>
					</span>
					<ChevronsUpDownIcon class="ms-auto size-4 shrink-0" aria-hidden="true" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content class="w-96 max-w-[calc(100vw-2rem)] rounded-lg p-2" align="start" sideOffset={6}>
			<div class="space-y-2">
				<div class="flex items-center justify-between gap-2 px-1">
					<DropdownMenu.Label class="px-0 text-xs text-muted-foreground">Spaces</DropdownMenu.Label>
					<Button variant="ghost" size="icon-sm" aria-label="Create Space" onclick={() => onCreateSpace?.()}>
						<PlusIcon class="size-4" aria-hidden="true" />
					</Button>
				</div>
				<Button
					variant={localSelectedSpaceId === null ? "secondary" : "ghost"}
					class="h-auto w-full justify-start rounded-md px-2 py-2 text-start"
					aria-current={localSelectedSpaceId === null ? "true" : undefined}
					onclick={selectAll}
				>
					<span class="flex size-8 items-center justify-center rounded-md border bg-background">
						<Globe2Icon class="size-4 text-muted-foreground" aria-hidden="true" />
					</span>
					<span class="grid min-w-0 flex-1">
						<span class="truncate font-medium">All spaces</span>
						<span class="truncate text-xs text-muted-foreground">Producer panel across every Space</span>
					</span>
				</Button>
				<DataState
					state={dataState}
					error={localError}
					emptyTitle="No spaces yet"
					emptyDescription="Create a Space to start supervising work."
					loadingTitle="Loading spaces"
					loadingDescription="Fetching Spaces and their current work."
					errorTitle="Spaces unavailable"
					errorFallback="Spaces could not be loaded."
					retryLabel="Retry"
					onRetry={() => void loadOverviews()}
				>
					<div class="grid gap-1" aria-label="Space overviews">
						{#each localRows as row (row.space.id)}
							<SpaceOverviewRow
								{row}
								selected={row.space.id === localSelectedSpaceId}
								onSelect={selectSpace}
							/>
						{/each}
					</div>
				</DataState>
			</div>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
