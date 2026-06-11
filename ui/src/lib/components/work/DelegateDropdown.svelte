<script lang="ts">
  import { Select } from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";

  export type DelegateOption = {
    value: string;
    label: string;
    status?: string;
  };

  let {
    value = $bindable(""),
    agents = [],
    label = "Delegate",
    placeholder = "Unassigned",
    disabled = false,
  } = $props<{
    value?: string;
    agents?: DelegateOption[];
    label?: string;
    placeholder?: string;
    disabled?: boolean;
  }>();
</script>

<div class="delegate-dropdown">
  <Label for="delegate-dropdown">{label}</Label>
  <Select id="delegate-dropdown" bind:value aria-label={label} {disabled} class="delegate-select">
    <option value="">{placeholder}</option>
    {#each agents as agent (agent.value)}
      <option value={agent.value}>
        {agent.label}
        {#if agent.status} · {agent.status}{/if}
      </option>
    {/each}
  </Select>
</div>

<style>
  .delegate-dropdown {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .delegate-select {
    width: 100%;
  }
</style>
