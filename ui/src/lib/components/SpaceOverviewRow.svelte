<script lang="ts" module>
	import type { Space, SpaceOverviewAggregate } from "$lib/api/spaces";

	export type SpaceOverviewRowModel = {
		space: Space;
		aggregate: SpaceOverviewAggregate;
	};
</script>

<script lang="ts">
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import { cn } from "$lib/utils.js";

	let {
		row,
		selected = false,
		asMenuItem = false,
		onSelect,
		class: className,
	}: {
		row: SpaceOverviewRowModel;
		selected?: boolean;
		asMenuItem?: boolean;
		onSelect?: (spaceId: string) => void;
		class?: string;
	} = $props();

	let spendLabel = $derived(formatSpend(row.aggregate.spendUsd));
	let rootClass = $derived(cn("h-auto w-full justify-start rounded-md px-2 py-2 text-start", className));

	function formatSpend(value: number | null): string {
		if (value === null) return "Not reported";
		if (value === 0) return "$0.0000";
		if (value < 0.01) return `$${value.toFixed(4)}`;
		return `$${value.toFixed(2)}`;
	}

	function handleSelect() {
		onSelect?.(row.space.id);
	}
</script>

{#snippet rowContent()}
	<span class="grid min-w-0 flex-1 gap-1">
		<span class="flex min-w-0 items-center gap-2">
			<span class="truncate font-medium">{row.space.name}</span>
			<Badge variant="secondary" class="shrink-0">{row.space.stage}</Badge>
		</span>
		<span class="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
			<span><strong class="text-foreground">{row.aggregate.pendingCount}</strong> pending</span>
			<span><strong class="text-foreground">{row.aggregate.liveCount}</strong> live</span>
			<span><strong class="text-foreground">{spendLabel}</strong> spend</span>
		</span>
	</span>
	<ArrowRightIcon class="ms-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
{/snippet}

{#if asMenuItem}
	<DropdownMenu.Item
		onSelect={handleSelect}
		class={cn(rootClass, selected && "bg-secondary text-secondary-foreground")}
		aria-current={selected ? "true" : undefined}
		data-slot="space-overview-row"
	>
		{@render rowContent()}
	</DropdownMenu.Item>
{:else}
	<Button
		variant={selected ? "secondary" : "ghost"}
		class={rootClass}
		aria-current={selected ? "true" : undefined}
		aria-label={`Select ${row.space.name}`}
		onclick={handleSelect}
		data-slot="space-overview-row"
	>
		{@render rowContent()}
	</Button>
{/if}
