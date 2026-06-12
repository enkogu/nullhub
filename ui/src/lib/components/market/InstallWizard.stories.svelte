<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import InstallWizard from "./InstallWizard.svelte";
  import { marketPackages } from "./fixtures";

  const { Story } = defineMeta({
    title: "Market/InstallWizard",
    component: InstallWizard,
  });

  const spaces = [
    { id: "ops", name: "Operations", kind: "workspace", stage: "active" },
    { id: "lab", name: "Lab", kind: "workspace", stage: "active" },
  ];

  const agents = [
    { id: "runtime-operator", name: "runtime-operator", role: "Runtime operator", status: "running" },
    { id: "loop-owner", name: "loop-owner", role: "Loop operator", status: "running" },
    { id: "tool-maintainer", name: "tool-maintainer", role: "Tool maintainer", status: "stopped" },
  ];
</script>

{#snippet wizardTemplate(args)}
  <InstallWizard {...args} />
{/snippet}

<Story
  name="Populated"
  args={{ pkg: marketPackages[1], spaces, selectedSpaceId: "ops", agents }}
  template={wizardTemplate}
/>
<Story
  name="Staff Empty"
  args={{ pkg: marketPackages[2], spaces, selectedSpaceId: "ops", agents: [], agentsState: "empty", initialStepId: "staff" }}
  template={wizardTemplate}
/>
<Story name="Loading" args={{ state: "loading" }} template={wizardTemplate} />
<Story name="Empty" args={{ state: "empty" }} template={wizardTemplate} />
<Story
  name="Error"
  args={{ state: "error", error: Object.assign(new Error("Install wizard unavailable."), { status: 503 }) }}
  template={wizardTemplate}
/>
