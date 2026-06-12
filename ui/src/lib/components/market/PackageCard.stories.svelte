<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import PackageCard from "./PackageCard.svelte";
  import { marketPackages } from "./fixtures";

  const { Story } = defineMeta({
    title: "Market/PackageCard",
    component: PackageCard,
  });
</script>

{#snippet cardTemplate(args)}
  <div class="max-w-md">
    <PackageCard {...args} />
  </div>
{/snippet}

<Story name="Loop Kit" args={{ pkg: marketPackages[1] }} template={cardTemplate} />
<Story name="Installed Component" args={{ pkg: marketPackages[0], installed: true }} template={cardTemplate} />
<Story name="Blueprint" args={{ pkg: marketPackages[3] }} template={cardTemplate} />
