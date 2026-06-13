<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import type { PackageManifest } from "$lib/api/packages";
  import { packagesApi } from "$lib/api/client";
  import NewSpaceFlow, { type NewSpaceSubmitInput } from "$lib/components/spaces/NewSpaceFlow.svelte";
  import type { DataStateKind } from "$lib/components/DataState.svelte";
  import { spacesStore } from "$lib/stores/spaces.svelte";
  import { encodePathSegment } from "$lib/nullstack/path";

  let blueprints = $state<PackageManifest[]>([]);
  let blueprintsState = $state<DataStateKind>("loading");
  let blueprintsError = $state<unknown>(null);
  let submitting = $state(false);
  let submitError = $state("");

  onMount(() => {
    void loadBlueprints();
  });

  function isBlueprint(pkg: PackageManifest): boolean {
    return pkg.scale === "blueprint" || pkg.itemType === "blueprint";
  }

  async function loadBlueprints() {
    blueprintsState = "loading";
    blueprintsError = null;
    try {
      const catalog = await packagesApi.listCatalogPackages();
      blueprints = catalog.packages.filter(isBlueprint);
      blueprintsState = blueprints.length > 0 ? "populated" : "empty";
    } catch (error) {
      blueprints = [];
      blueprintsError = error;
      blueprintsState = "error";
    }
  }

  async function createSpace(input: NewSpaceSubmitInput) {
    if (submitting) return;
    submitting = true;
    submitError = "";
    try {
      const created = await spacesStore.createSpace({ name: input.name });
      const scopedQuery = `space=${encodeURIComponent(created.id)}`;
      if (input.mode === "blueprint" && input.blueprintId) {
        await goto(`/market/install/${encodePathSegment(input.blueprintId)}?${scopedQuery}`);
        return;
      }
      await goto(`/?${scopedQuery}`);
    } catch (error) {
      submitError = (error as Error).message || "Unable to create Space.";
    } finally {
      submitting = false;
    }
  }
</script>

<NewSpaceFlow
  {blueprints}
  state={blueprintsState}
  error={blueprintsError}
  {submitting}
  {submitError}
  onRetry={() => void loadBlueprints()}
  onSubmit={createSpace}
/>
