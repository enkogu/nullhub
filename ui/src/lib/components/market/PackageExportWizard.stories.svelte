<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import PackageExportWizard from "./PackageExportWizard.svelte";
  import { exportedMarketPackage, marketPackages } from "./fixtures";

  const { Story } = defineMeta({
    title: "Market/PackageExportWizard",
    component: PackageExportWizard,
  });
</script>

{#snippet wizardTemplate(args)}
  <PackageExportWizard {...args} />
{/snippet}

<Story name="Ready" args={{ installedPackages: marketPackages.slice(0, 2) }} template={wizardTemplate} />
<Story
  name="Exported"
  args={{
    installedPackages: marketPackages.slice(0, 2),
    exportResult: {
      status: "exported",
      packageId: "export.ops.loop-kit",
      file: "/tmp/nullhub/spaces/ops/packages/export.ops.loop-kit.json",
      downloadUrl: "/api/market/library/export.ops.loop-kit.json?space=ops",
      package: exportedMarketPackage,
      raw: {},
    },
  }}
  template={wizardTemplate}
/>
