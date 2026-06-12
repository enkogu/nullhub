<script lang="ts">
  import FilterBar, { type FilterDefinition } from "$lib/components/FilterBar.svelte";
  import {
    marketScaleOptions,
    marketStageOptions,
    marketTypeOptions,
    type MarketFilters,
  } from "./market";

  let {
    filters = $bindable({ query: "", type: "", scale: "", stage: "" }),
    resultCount = 0,
    state = "populated",
    onChange,
    onReset,
  }: {
    filters?: MarketFilters;
    resultCount?: number;
    state?: "loading" | "empty" | "error" | "populated";
    onChange?: (filters: MarketFilters) => void;
    onReset?: () => void;
  } = $props();

  let definitions = $derived<FilterDefinition[]>([
    { key: "type", label: "Type", value: filters.type, options: marketTypeOptions },
    { key: "scale", label: "Scale", value: filters.scale, options: marketScaleOptions },
    { key: "stage", label: "Stage", value: filters.stage, options: marketStageOptions },
  ]);

  function emit(next: MarketFilters) {
    filters = next;
    onChange?.(filters);
  }

  function handleQueryChange(query: string) {
    emit({ ...filters, query });
  }

  function handleFilterChange(key: string, value: string) {
    emit({ ...filters, [key]: value });
  }

  function reset() {
    const next = { query: "", type: "", scale: "", stage: "" };
    filters = next;
    onReset?.();
    onChange?.(next);
  }
</script>

<FilterBar
  bind:query={filters.query}
  searchLabel="Search packages"
  searchPlaceholder="Search packages"
  filters={definitions}
  {resultCount}
  resetLabel="Clear"
  {state}
  onQueryChange={handleQueryChange}
  onFilterChange={handleFilterChange}
  onReset={reset}
/>
