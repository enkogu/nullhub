<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import PackageLibraryView from "./PackageLibraryView.svelte";
  import { exportedMarketPackage, marketPackages } from "./fixtures";

  const { Story } = defineMeta({
    title: "Market/PackageLibraryView",
    component: PackageLibraryView,
  });
</script>

{#snippet libraryTemplate(args)}
  <PackageLibraryView {...args} />
{/snippet}

<Story
  name="Installed"
  args={{ packages: marketPackages.slice(0, 2), spaceId: "ops" }}
  template={libraryTemplate}
/>
<Story
  name="My Packages"
  args={{
    title: "My Packages",
    packages: [marketPackages[0], exportedMarketPackage],
    exportedOnly: true,
    spaceId: "ops",
  }}
  template={libraryTemplate}
/>
<Story name="Empty" args={{ packages: [], state: "empty" }} template={libraryTemplate} />
