<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import HireWizard from "./HireWizard.svelte";

  const { Story } = defineMeta({
    title: "Components/HireWizard",
    component: HireWizard,
  });
</script>

<Story
  name="Populated"
  args={{
    component: "nullclaw",
    existingNames: ["sdr-agent"],
    availableModels: ["google/gemma-4-31b-it:free", "openai/gpt-5.5"],
  }}
/>
