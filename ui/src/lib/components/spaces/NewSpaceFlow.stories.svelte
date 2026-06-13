<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import { marketPackages } from "$lib/components/market/fixtures";
  import NewSpaceFlow from "./NewSpaceFlow.svelte";

  const { Story } = defineMeta({
    title: "Spaces/NewSpaceFlow",
    component: NewSpaceFlow,
  });

  const blueprints = marketPackages.filter((pkg) => pkg.scale === "blueprint" || pkg.itemType === "blueprint");
</script>

{#snippet template(args)}
  <div class="max-w-5xl p-6">
    <NewSpaceFlow {...args} />
  </div>
{/snippet}

<Story name="Empty Selected" args={{ blueprints, state: "populated" }} template={template} />
<Story name="Blueprint Selected" args={{ blueprints, state: "populated", initialMode: "blueprint" }} template={template} />
<Story name="Loading Blueprints" args={{ blueprints: [], state: "loading", initialMode: "blueprint" }} template={template} />
<Story name="No Blueprints" args={{ blueprints: [], state: "empty", initialMode: "blueprint" }} template={template} />
<Story
  name="Blueprint Error"
  args={{ blueprints: [], state: "error", initialMode: "blueprint", error: new Error("Catalog unavailable.") }}
  template={template}
/>
