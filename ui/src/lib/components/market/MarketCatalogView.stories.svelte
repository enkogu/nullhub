<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import MarketCatalogView from "./MarketCatalogView.svelte";
  import { marketPackages } from "./fixtures";

  const { Story } = defineMeta({
    title: "Market/MarketCatalogView",
    component: MarketCatalogView,
  });
</script>

{#snippet catalogTemplate(args)}
  <MarketCatalogView {...args} />
{/snippet}

<Story
  name="Populated"
  args={{ packages: marketPackages, installedPackageIds: new Set(["builtin.nullclaw-agent"]) }}
  template={catalogTemplate}
/>
<Story name="Loading" args={{ state: "loading", packages: [] }} template={catalogTemplate} />
<Story name="Empty" args={{ state: "empty", packages: [] }} template={catalogTemplate} />
<Story
  name="Error"
  args={{ state: "error", error: Object.assign(new Error("Catalog unavailable."), { status: 503 }) }}
  template={catalogTemplate}
/>
