<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Badge } from "$lib/components/ui/badge";
  import { Label } from "$lib/components/ui/label";
  import CheckIcon from "@lucide/svelte/icons/check";

  let {
    step,
    value = "",
    onchange,
  } = $props<{
    step: {
      id: string;
      title: string;
      description?: string;
      type: string;
      options?: Array<{
        value: string;
        label: string;
        description?: string;
        recommended?: boolean;
      }>;
      required?: boolean;
      default_value?: string;
    };
    value: string;
    onchange: (value: string) => void;
  }>();

  // Searchable dropdown state (for select with many options)
  const SEARCHABLE_THRESHOLD = 10;
  let searchQuery = $state("");
  let dropdownOpen = $state(false);

  let isSearchable = $derived(
    step.type === "select" &&
      (step.options?.length || 0) > SEARCHABLE_THRESHOLD,
  );

  let filteredOptions = $derived(
    isSearchable && searchQuery
      ? (step.options || []).filter(
          (o) =>
            o.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            o.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (o.description || "")
              .toLowerCase()
              .includes(searchQuery.toLowerCase()),
        )
      : step.options || [],
  );

  let selectedOption = $derived(
    (step.options || []).find((o) => o.value === value),
  );
  let selectedLabel = $derived(
    selectedOption
      ? selectedOption.recommended
        ? `${selectedOption.label} (recommended)`
        : selectedOption.label
      : "",
  );

  function selectOption(optValue: string) {
    onchange(optValue);
    dropdownOpen = false;
    searchQuery = "";
  }

  function handleSearchInput(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
    dropdownOpen = true;
  }

  function handleSearchFocus() {
    dropdownOpen = true;
  }

  function handleSearchBlur() {
    // Delay to allow click on option
    setTimeout(() => {
      dropdownOpen = false;
    }, 200);
  }
</script>

<div class="mb-6">
  <Label class="mb-1 block">{step.title}</Label>
  {#if step.description}
    <p class="mb-3 text-sm text-muted-foreground">{step.description}</p>
  {/if}

  {#if step.type === "select" && isSearchable}
    <!-- Searchable dropdown for select with many options -->
    <div class="relative">
      <Input
        type="text"
        placeholder={selectedLabel || "Search..."}
        value={dropdownOpen ? searchQuery : selectedLabel}
        oninput={handleSearchInput}
        onfocus={handleSearchFocus}
        onblur={handleSearchBlur}
      />
      {#if dropdownOpen}
        <div
          class="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover shadow-md"
        >
          {#each filteredOptions as option}
            <button
              type="button"
              class="flex w-full flex-col gap-1 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-accent {value ===
              option.value
                ? 'bg-accent'
                : ''}"
              onmousedown={() => selectOption(option.value)}
            >
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-foreground">{option.label}</span>
                {#if option.recommended}
                  <Badge variant="secondary">recommended</Badge>
                {/if}
              </div>
              {#if option.description}
                <span class="text-xs text-muted-foreground">{option.description}</span>
              {/if}
            </button>
          {:else}
            <div class="px-3 py-3 text-center text-sm text-muted-foreground">No matches</div>
          {/each}
        </div>
      {/if}
    </div>
  {:else if step.type === "select"}
    <div class="flex flex-col gap-2">
      {#each step.options || [] as option}
        <button
          type="button"
          class="flex flex-col gap-1 rounded-md border px-4 py-3 text-left transition-colors hover:bg-accent {value ===
          option.value
            ? 'border-foreground bg-accent'
            : ''}"
          onclick={() => onchange(option.value)}
        >
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-foreground">{option.label}</span>
            {#if option.recommended}
              <Badge variant="secondary">recommended</Badge>
            {/if}
          </div>
          {#if option.description}<span class="text-xs text-muted-foreground"
              >{option.description}</span
            >{/if}
        </button>
      {/each}
    </div>
  {:else if step.type === "multi_select"}
    <div class="flex flex-row flex-wrap gap-2">
      {#each step.options || [] as option}
        {@const selected = value.split(",").includes(option.value)}
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent {selected
            ? 'border-foreground bg-accent'
            : ''}"
          onclick={() => {
            const vals = value ? value.split(",").filter(Boolean) : [];
            if (selected)
              onchange(vals.filter((v) => v !== option.value).join(","));
            else onchange([...vals, option.value].join(","));
          }}
        >
          {#if selected}<CheckIcon class="size-3.5" />{/if}
          {option.label}
        </button>
      {/each}
    </div>
  {:else if step.type === "secret"}
    <Input
      type="password"
      {value}
      oninput={(e) => onchange(e.currentTarget.value)}
      placeholder="Enter secret..."
    />
  {:else if step.type === "number"}
    <Input
      type="number"
      {value}
      oninput={(e) => onchange(e.currentTarget.value)}
    />
  {:else if step.type === "toggle"}
    <label class="toggle">
      <input
        type="checkbox"
        checked={value === "true"}
        onchange={(e) => onchange(String(e.currentTarget.checked))}
      />
      <span class="toggle-slider"></span>
    </label>
  {:else}
    <Input
      type="text"
      {value}
      oninput={(e) => onchange(e.currentTarget.value)}
      placeholder="Enter value..."
    />
  {/if}
</div>

<style>
  /* Toggle styled as a clean shadcn-style switch */
  .toggle {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    cursor: pointer;
  }

  .toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--shadcn-input);
    border-radius: 9999px;
    transition: background-color 0.2s ease;
  }

  .toggle-slider::before {
    content: "";
    position: absolute;
    width: 18px;
    height: 18px;
    left: 3px;
    top: 3px;
    background: var(--shadcn-background);
    border-radius: 9999px;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.15);
    transition: transform 0.2s ease;
  }

  .toggle input:checked + .toggle-slider {
    background: var(--shadcn-primary);
  }

  .toggle input:checked + .toggle-slider::before {
    transform: translateX(20px);
  }
</style>
