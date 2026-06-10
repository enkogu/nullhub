<script lang="ts" module>
	export type FilterBarState = "loading" | "empty" | "error" | "populated";

	export type FilterOption = {
		label: string;
		value: string;
	};

	export type FilterDefinition = {
		key: string;
		label: string;
		value?: string;
		options: FilterOption[];
	};
</script>

<script lang="ts">
	import SearchIcon from "@lucide/svelte/icons/search";
	import { cn } from "$lib/utils.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Select } from "$lib/components/ui/select/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import CountBadge from "./CountBadge.svelte";
	import EmptyState from "./EmptyState.svelte";
	import ErrorState from "./ErrorState.svelte";

	let {
		query = $bindable(""),
		searchLabel = "Search",
		searchPlaceholder = "Search",
		filters = [],
		resultCount,
		resetLabel = "Reset",
		state = "populated",
		errorTitle = "Filters unavailable",
		errorMessage = "Filter controls could not be loaded.",
		emptyTitle = "No filters available",
		emptyDescription = "This surface does not expose any filter controls yet.",
		onQueryChange,
		onFilterChange,
		onReset,
		class: className,
	}: {
		query?: string;
		searchLabel?: string;
		searchPlaceholder?: string;
		filters?: FilterDefinition[];
		resultCount?: number;
		resetLabel?: string;
		state?: FilterBarState;
		errorTitle?: string;
		errorMessage?: string;
		emptyTitle?: string;
		emptyDescription?: string;
		onQueryChange?: (query: string) => void;
		onFilterChange?: (key: string, value: string) => void;
		onReset?: () => void;
		class?: string;
	} = $props();

	function handleQueryInput(event: Event) {
		query = (event.currentTarget as HTMLInputElement).value;
		onQueryChange?.(query);
	}

	function handleFilterChange(key: string, event: Event) {
		onFilterChange?.(key, (event.currentTarget as HTMLSelectElement).value);
	}

	function reset() {
		query = "";
		onReset?.();
	}
</script>

<div data-slot="filter-bar" class={cn("w-full", className)} aria-busy={state === "loading"}>
	{#if state === "loading"}
		<div class="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:items-center">
			<Skeleton class="h-9 flex-1" aria-label="Loading filters" />
			<Skeleton class="h-9 w-full md:w-36" />
			<Skeleton class="h-9 w-full md:w-24" />
		</div>
	{:else if state === "error"}
		<ErrorState title={errorTitle} message={errorMessage} compact />
	{:else if state === "empty"}
		<EmptyState title={emptyTitle} description={emptyDescription} icon="search" tone="neutral" />
	{:else}
		<div class="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:items-center">
			<div class="relative min-w-0 flex-1">
				<SearchIcon class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
				<Input
					value={query}
					aria-label={searchLabel}
					placeholder={searchPlaceholder}
					class="pl-9"
					oninput={handleQueryInput}
				/>
			</div>
			{#each filters as filter (filter.key)}
				<Select
					value={filter.value ?? ""}
					aria-label={filter.label}
					class="w-full md:w-40"
					onchange={(event) => handleFilterChange(filter.key, event)}
				>
					<option value="">All {filter.label}</option>
					{#each filter.options as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</Select>
			{/each}
			{#if resultCount !== undefined}
				<CountBadge count={resultCount} label={resultCount === 1 ? "result" : "results"} tone="primary" />
			{/if}
			<Button variant="outline" size="sm" onclick={reset}>{resetLabel}</Button>
		</div>
	{/if}
</div>
