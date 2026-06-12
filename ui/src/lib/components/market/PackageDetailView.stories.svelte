<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import PackageDetailView from "./PackageDetailView.svelte";
  import { marketPackages } from "./fixtures";

  const { Story } = defineMeta({
    title: "Market/PackageDetailView",
    component: PackageDetailView,
  });
</script>

{#snippet detailTemplate(args)}
  <PackageDetailView {...args} />
{/snippet}

<Story name="Populated" args={{ pkg: marketPackages[1] }} template={detailTemplate} />
<Story name="Installed" args={{ pkg: marketPackages[0], installed: true }} template={detailTemplate} />
<Story name="Loading" args={{ state: "loading" }} template={detailTemplate} />
<Story name="Empty" args={{ state: "empty" }} template={detailTemplate} />
<Story
  name="Error"
  args={{ state: "error", error: Object.assign(new Error("Package unavailable."), { status: 503 }) }}
  template={detailTemplate}
/>
