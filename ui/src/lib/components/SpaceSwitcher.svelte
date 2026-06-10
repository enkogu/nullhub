<script lang="ts" module>
	import type { Space } from "$lib/api/spaces";
	import type { SpacesStore } from "$lib/stores/spaces.svelte";

	export type SpaceSwitcherStore = Pick<
		SpacesStore,
		| "spaces"
		| "selectedSpaceId"
		| "selectedSpace"
		| "isAllSelected"
		| "status"
		| "error"
		| "selectedSpaceQuery"
		| "load"
		| "selectSpace"
		| "selectAll"
	>;

	type SpaceIndicatorShape = Space & {
		warn?: number | string | null;
		warnings?: number | string | null;
		warnCount?: number | string | null;
		warningCount?: number | string | null;
		warn_count?: number | string | null;
		warning_count?: number | string | null;
		live?: number | string | null;
		liveCount?: number | string | null;
		live_count?: number | string | null;
	};

	export type SpaceSwitcherState = "loading" | "empty" | "error" | "populated";
</script>

<script lang="ts">
	import { onMount } from "svelte";
	import { mergeProps } from "bits-ui";
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
	import GalleryVerticalEndIcon from "@lucide/svelte/icons/gallery-vertical-end";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import CountBadge from "$lib/components/CountBadge.svelte";
	import { spacesStore } from "$lib/stores/spaces.svelte";
	import { cn } from "$lib/utils.js";

	let {
		store = spacesStore,
		initialOpen = false,
		inlineMenu = false,
		autoLoad = true,
		onCreateSpace,
		class: className,
	}: {
		store?: SpaceSwitcherStore;
		initialOpen?: boolean;
		inlineMenu?: boolean;
		autoLoad?: boolean;
		onCreateSpace?: () => void;
		class?: string;
	} = $props();

	let menuOpen = $state(false);
	let isReloading = $state(false);
	let activeSpace = $derived.by(() => store.selectedSpace);
	let viewState = $derived.by<SpaceSwitcherState>(() => {
		if (store.status === "error") return "error";
		if (store.status === "idle" || store.status === "loading") return "loading";
		return store.spaces.length === 0 ? "empty" : "populated";
	});
	let totalWarnings = $derived.by(() => store.spaces.reduce((total, space) => total + warningCount(space), 0));
	let totalLive = $derived.by(() => store.spaces.reduce((total, space) => total + liveCount(space), 0));
	let triggerTitle = $derived.by(() => triggerTitleForState(viewState, activeSpace, store.isAllSelected));
	let triggerSubtitle = $derived.by(() => triggerSubtitleForState(viewState, activeSpace, store.spaces.length, store.error));

	onMount(() => {
		if (autoLoad && store.status === "idle") void loadSpaces();
	});

	$effect(() => {
		if (initialOpen) menuOpen = true;
	});

	async function loadSpaces() {
		isReloading = true;
		try {
			await store.load();
		} catch {
			// The store owns the error state displayed by this component.
		} finally {
			isReloading = false;
		}
	}

	function selectSpace(space: Space) {
		store.selectSpace(space.id);
	}

	function selectAllSpaces() {
		store.selectAll();
	}

	function createSpace() {
		onCreateSpace?.();
	}

	function triggerTitleForState(
		value: SpaceSwitcherState,
		selected: Space | null,
		allSelected: boolean,
	): string {
		if (value === "loading") return "Loading spaces";
		if (value === "error") return "Spaces unavailable";
		if (allSelected || !selected) return "All spaces";
		return selected.name || selected.id;
	}

	function triggerSubtitleForState(
		value: SpaceSwitcherState,
		selected: Space | null,
		spaceCount: number,
		error: string | null,
	): string {
		if (value === "loading") return "Resolving scope";
		if (value === "error") return error || "Open the menu to retry";
		if (value === "empty") return "No spaces yet";
		if (!selected) return `${spaceCount} ${spaceCount === 1 ? "space" : "spaces"}`;
		return [selected.kind, selected.stage].filter(Boolean).join(" / ");
	}

	function numberFrom(value: number | string | null | undefined): number | undefined {
		if (value === null || value === undefined || value === "") return undefined;
		const parsed = typeof value === "number" ? value : Number(value);
		return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
	}

	function firstNumber(...values: Array<number | string | null | undefined>): number | undefined {
		for (const value of values) {
			const parsed = numberFrom(value);
			if (parsed !== undefined) return parsed;
		}
		return undefined;
	}

	function warningCount(space: Space): number {
		const shaped = space as SpaceIndicatorShape;
		return firstNumber(
			shaped.warningCount,
			shaped.warnCount,
			shaped.warning_count,
			shaped.warn_count,
			shaped.warnings,
			shaped.warn,
		) ?? (warningStages.has(space.stage.toLowerCase()) ? 1 : 0);
	}

	function liveCount(space: Space): number {
		const shaped = space as SpaceIndicatorShape;
		return firstNumber(shaped.liveCount, shaped.live_count, shaped.live) ?? (liveStages.has(space.stage.toLowerCase()) ? 1 : 0);
	}

	const warningStages = new Set(["blocked", "degraded", "error", "failed", "paused", "stale", "warn", "warning"]);
	const liveStages = new Set(["active", "live", "running"]);
	const menuActionClass = "gap-2 p-2";
</script>

<div data-slot="space-switcher" class={cn("w-full", className)}>
	<DropdownMenu.Root bind:open={menuOpen}>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				{@const triggerProps = mergeProps(
					{
						type: "button" as const,
						class: cn(
							"data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start text-sm outline-hidden transition-[width,height,padding] focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!",
						),
						"aria-label": "Switch space",
					},
					props,
				)}
				<button {...triggerProps}>
					<span
						class={cn(
							"bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg",
							viewState === "error" && "bg-sidebar-accent text-risk",
						)}
						aria-hidden="true"
					>
						{#if viewState === "error"}
							<CircleAlertIcon class="size-4" />
						{:else}
							<GalleryVerticalEndIcon class="size-4" />
						{/if}
					</span>
					<span class="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
						<span class="truncate font-medium">{triggerTitle}</span>
						<span class="truncate text-xs text-muted-foreground">{triggerSubtitle}</span>
					</span>
					<span class="ms-auto flex shrink-0 items-center gap-1 group-data-[collapsible=icon]:hidden">
						<CountBadge count={totalWarnings} label="warn" tone={totalWarnings > 0 ? "watch" : "neutral"} class="px-1.5 py-0.5" />
						<CountBadge count={totalLive} label="live" tone={totalLive > 0 ? "ok" : "neutral"} class="px-1.5 py-0.5" />
					</span>
					<ChevronsUpDownIcon class="ms-auto size-4 shrink-0 group-data-[collapsible=icon]:hidden" />
				</button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content
			class="w-(--bits-dropdown-menu-anchor-width) min-w-72 rounded-lg"
			align="start"
			portalProps={{ disabled: inlineMenu }}
			side={inlineMenu ? "bottom" : "right"}
			sideOffset={4}
		>
			<DropdownMenu.Label class="text-muted-foreground text-xs">Spaces</DropdownMenu.Label>
			{#if viewState === "loading"}
				<div class="space-y-2 p-2" aria-busy="true" aria-label="Loading spaces">
					<Skeleton class="h-8 w-full" />
					<Skeleton class="h-8 w-5/6" />
				</div>
			{:else if viewState === "error"}
				<div class="space-y-2 p-2">
					<div class="flex items-start gap-2 text-sm text-muted-foreground">
						<CircleAlertIcon class="mt-0.5 size-4 shrink-0 text-risk" aria-hidden="true" />
						<span>{store.error || "Spaces could not be loaded."}</span>
					</div>
					<DropdownMenu.Item onSelect={() => void loadSpaces()} class={menuActionClass} disabled={isReloading}>
						<ActivityIcon class="size-4" />
						{isReloading ? "Retrying" : "Retry spaces"}
					</DropdownMenu.Item>
				</div>
			{:else}
				<DropdownMenu.Item onSelect={selectAllSpaces} class={menuActionClass}>
					<GalleryVerticalEndIcon class="size-4" />
					<span class="grid min-w-0 flex-1">
						<span class="truncate font-medium">All spaces</span>
						<span class="truncate text-xs text-muted-foreground">Unscoped product view</span>
					</span>
					<span class="ms-auto flex items-center gap-1">
						<CountBadge count={totalWarnings} label="warn" tone={totalWarnings > 0 ? "watch" : "neutral"} class="px-1.5 py-0.5" />
						<CountBadge count={totalLive} label="live" tone={totalLive > 0 ? "ok" : "neutral"} class="px-1.5 py-0.5" />
						{#if store.isAllSelected}
							<CheckIcon class="size-4 text-ok" />
						{/if}
					</span>
				</DropdownMenu.Item>
				{#if viewState === "empty"}
					<div class="px-2 py-3 text-sm text-muted-foreground">No spaces yet</div>
				{:else}
					{#each store.spaces as space (space.id)}
						<DropdownMenu.Item onSelect={() => selectSpace(space)} class={menuActionClass}>
							<GalleryVerticalEndIcon class="size-4" />
							<span class="grid min-w-0 flex-1">
								<span class="truncate font-medium">{space.name || space.id}</span>
								<span class="truncate text-xs text-muted-foreground">{space.kind} / {space.stage}</span>
							</span>
							<span class="ms-auto flex items-center gap-1">
								<CountBadge count={warningCount(space)} label="warn" tone={warningCount(space) > 0 ? "watch" : "neutral"} class="px-1.5 py-0.5" />
								<CountBadge count={liveCount(space)} label="live" tone={liveCount(space) > 0 ? "ok" : "neutral"} class="px-1.5 py-0.5" />
								{#if store.selectedSpaceId === space.id}
									<CheckIcon class="size-4 text-ok" />
								{/if}
							</span>
						</DropdownMenu.Item>
					{/each}
				{/if}
			{/if}
			<DropdownMenu.Separator />
			<DropdownMenu.Item onSelect={createSpace} class={menuActionClass}>
				<span class="flex size-6 items-center justify-center rounded-md border bg-transparent" aria-hidden="true">
					<PlusIcon class="size-4" />
				</span>
				<span class="text-muted-foreground font-medium">New space</span>
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
