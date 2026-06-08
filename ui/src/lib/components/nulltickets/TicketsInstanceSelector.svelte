<script lang="ts">
  import ManagedInstanceSelector from "../ManagedInstanceSelector.svelte";
  import {
    getSelectedTicketsInstance,
    setSelectedTicketsInstance,
  } from "$lib/nullstack/backendSelection";

  let {
    label = "NullTickets",
    onChange = () => {},
  } = $props<{
    label?: string;
    onChange?: (name: string) => void;
  }>();
</script>

<ManagedInstanceSelector
  component="nulltickets"
  {label}
  getSelected={getSelectedTicketsInstance}
  setSelected={setSelectedTicketsInstance}
  {onChange}
/>
