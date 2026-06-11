<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import DelegateDropdown from "./DelegateDropdown.svelte";

  const { Story } = defineMeta({
    title: "Work/Delegate Dropdown",
    component: DelegateDropdown,
  });
</script>

{#snippet defaultTemplate()}
  <DelegateDropdown
    agents={[
      { value: "writer", label: "Writer agent", status: "running" },
      { value: "ops", label: "Ops agent", status: "idle" },
    ]}
    label="Delegate to"
    placeholder="Unassigned"
  />
{/snippet}

{#snippet selectedTemplate()}
  <DelegateDropdown
    value="writer"
    agents={[
      { value: "writer", label: "Writer agent", status: "running" },
      { value: "ops", label: "Ops agent", status: "idle" },
    ]}
    label="Delegate to"
    placeholder="Unassigned"
  />
{/snippet}

<Story name="Default" template={defaultTemplate} />
<Story name="Selected" template={selectedTemplate} />
