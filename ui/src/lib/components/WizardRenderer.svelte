<script lang="ts">
  import WizardStep from "./WizardStep.svelte";
  import ProviderList from "./ProviderList.svelte";
  import ChannelList from "./ChannelList.svelte";
  import { api } from "$lib/api/client";
  import { OPENAI_COMPATIBLE_VALUE } from "$lib/providers";
  import { Card } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Select } from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import CheckIcon from "@lucide/svelte/icons/check";

  let {
    component = "",
    steps = [],
    onVersionChange = (_version: string) => {},
    onComplete,
  } = $props<{
    component: string;
    steps: any[];
    onVersionChange?: (version: string) => void;
    onComplete?: () => void;
  }>();

  let answers = $state<Record<string, string>>({});
  let instanceName = $state("");
  let currentPage = $state(0);
  let installing = $state(false);
  let installMessage = $state("");
  let versions = $state<any[]>([]);
  let selectedVersion = $state("latest");
  let channels = $state<Record<string, Record<string, Record<string, any>>>>({});
  let showAdvanced = $state(false);
  const instanceNameId = "wizard-instance-name";

  // Validation state
  let validating = $state(false);
  let providerValidationResults = $state<any[]>([]);
  let channelValidationResults = $state<any[]>([]);
  let validationError = $state("");
  let validationWarning = $state("");
  let existingInstanceNames = $state<string[]>([]);
  let instanceNameComponent = $state("");

  function nextInstanceName(componentName: string, names: string[]): string {
    let id = 1;
    while (names.includes(`${componentName}-${id}`)) id++;
    return `${componentName}-${id}`;
  }

  // Auto-generate instance name when the selected component changes.
  $effect(() => {
    const componentName = component;
    if (!componentName || instanceNameComponent === componentName) return;
    instanceNameComponent = componentName;
    api
      .getInstances()
      .then((data: any) => {
        const existing = data?.instances?.[componentName] || {};
        const names = Object.keys(existing);
        existingInstanceNames = names;
        instanceName = nextInstanceName(componentName, names);
      })
      .catch(() => {
        existingInstanceNames = [];
        instanceName = `${componentName}-1`;
      });
  });

  let trimmedInstanceName = $derived(instanceName.trim());
  let instanceNameError = $derived(
    !trimmedInstanceName
      ? "Instance name is required"
      : existingInstanceNames.includes(trimmedInstanceName)
        ? "Instance name must be unique for this component"
        : "",
  );

  // Fetch available versions
  $effect(() => {
    if (component) {
      api
        .getVersions(component)
        .then((data: any) => {
          versions = Array.isArray(data) ? data : [];
          if (versions.length > 0) {
            const rec = versions.find((v: any) => v.recommended);
            setSelectedVersion(rec?.value || versions[0].value);
          }
        })
        .catch(() => {
          versions = [{ value: "latest", label: "latest", recommended: true }];
          setSelectedVersion("latest");
        });
    }
  });

  function setSelectedVersion(version: string) {
    const next = version || "latest";
    if (selectedVersion === next) return;
    selectedVersion = next;
    resetWizardInputs();
    onVersionChange(next);
  }

  function resetWizardInputs() {
    answers = {};
    channels = {};
    providerValidationResults = [];
    channelValidationResults = [];
    validationError = "";
    validationWarning = "";
    showAdvanced = false;
  }

  // Apply default values from steps
  $effect(() => {
    for (const step of steps) {
      if (step.default_value && !(step.id in answers)) {
        answers[step.id] = step.default_value;
      } else if (step.options?.length && !(step.id in answers)) {
        const rec = step.options.find((o: any) => o.recommended);
        if (rec) answers[step.id] = rec.value;
      }
    }
  });

  $effect(() => {
    if (component !== "nullboiler" || !("tracker_instance" in answers)) return;
    if ((answers["tracker_instance"] || "").length > 0) {
      answers["tracker_enabled"] = "true";
    } else if (answers["tracker_enabled"] === "true") {
      answers["tracker_enabled"] = "false";
    }
  });

  // Initialize default provider entry when provider step exists
  $effect(() => {
    if (!("_providers" in answers)) {
      const providerStep = steps.find((s) => s.id === "provider");
      if (providerStep) {
        const rec = providerStep.options?.find((o: any) => o.recommended);
        const defaultProvider =
          rec?.value || providerStep.options?.[0]?.value || "";
        answers["_providers"] = JSON.stringify([
          { provider: defaultProvider, api_key: "", model: "", base_url: "", provider_name: "" },
        ]);
      }
    }
  });

  function isStepVisible(step: any): boolean {
    if (!step.condition) return true;
    const ref = answers[step.condition.step] || "";
    if (step.condition.equals !== undefined && step.condition.equals !== null) {
      return ref === step.condition.equals;
    }
    if (step.condition.not_equals !== undefined && step.condition.not_equals !== null) {
      return ref !== step.condition.not_equals;
    }
    if (step.condition.contains !== undefined && step.condition.contains !== null) {
      return ref.split(",").includes(step.condition.contains);
    }
    if (step.condition.not_in !== undefined && step.condition.not_in !== null) {
      const excluded = step.condition.not_in.split(",");
      return !excluded.includes(ref);
    }
    return true;
  }

  let settingsSteps = $derived(
    steps.filter(
      (s) =>
        s.id !== "provider" &&
        s.id !== "api_key" &&
        s.id !== "model" &&
        s.group !== "providers" &&
        s.group !== "channels" &&
        !s.advanced &&
        isStepVisible(s),
    ),
  );

  let advancedSteps = $derived(
    steps.filter(
      (s) =>
        s.advanced &&
        s.id !== "provider" &&
        s.id !== "api_key" &&
        s.id !== "model" &&
        isStepVisible(s),
    ),
  );

  let providerStep = $derived(steps.find((s) => s.id === "provider"));
  let hasChannelsPage = $derived(component === "nullclaw");
  let pageKinds = $derived(
    hasChannelsPage ? ["setup", "channels", "settings"] : ["setup", "settings"],
  );
  let pageLabels = $derived(
    pageKinds.map((kind) =>
      kind === "setup" ? "Setup" : kind === "channels" ? "Channels" : "Settings",
    ),
  );

  $effect(() => {
    if (currentPage >= pageKinds.length) {
      currentPage = pageKinds.length - 1;
    }
  });

  $effect(() => {
    component;
    steps;
    showAdvanced = false;
  });

  function customProviderError(entries: any[]) {
    for (const entry of entries) {
      if (entry.provider !== OPENAI_COMPATIBLE_VALUE) continue;
      if (!(entry.provider_name || "").trim()) {
        return "Provider name is required for OpenAI Compatible providers.";
      }
      if (!(entry.base_url || "").trim()) {
        return "Base URL is required for OpenAI Compatible providers.";
      }
    }
    return "";
  }

  function normalizeProviderEntries(entries: any[]) {
    return entries.map((entry: any) => {
      if (entry.provider === OPENAI_COMPATIBLE_VALUE) {
        const { provider_name, ...rest } = entry;
        return {
          ...rest,
          provider: (provider_name || "").trim(),
          base_url: (entry.base_url || "").trim(),
        };
      }
      const rest = { ...entry };
      delete rest.provider_name;
      delete rest.base_url;
      return rest;
    });
  }

  async function validateProviders(): Promise<boolean> {
    validating = true;
    validationError = "";
    validationWarning = "";
    providerValidationResults = [];

    try {
      const rawProviders: any[] = JSON.parse(answers["_providers"] || "[]");
      if (rawProviders.length === 0) {
        validationError = "Add at least one provider";
        return false;
      }

      const customError = customProviderError(rawProviders);
      if (customError) {
        validationError = customError;
        return false;
      }

      const providers = normalizeProviderEntries(rawProviders);
      const customProbeResults: Array<{ provider: string; live_ok: boolean; reason: string }> = [];

      for (const provider of providers) {
        if (!provider.base_url) continue;
        try {
          const probe = await api.probeProviderModels(provider.base_url, provider.api_key || "");
          customProbeResults.push({
            provider: provider.provider,
            live_ok: probe.live_ok,
            reason: probe.reason || "",
          });
        } catch {
          customProbeResults.push({
            provider: provider.provider,
            live_ok: false,
            reason: "probe_request_failed",
          });
        }
      }

      if (customProbeResults.some((result) => !result.live_ok)) {
        providerValidationResults = customProbeResults;
        return false;
      }

      const result = await api.validateProviders(component, providers);
      const backendResults = result.results || [];
      const mergedResults = backendResults.map(
        (backend: any) =>
          customProbeResults.find((custom) => custom.provider === backend.provider) || backend,
      );
      for (const custom of customProbeResults) {
        if (!mergedResults.some((entry: any) => entry.provider === custom.provider)) {
          mergedResults.push(custom);
        }
      }

      providerValidationResults = mergedResults;
      validationWarning = result.saved_providers_warning || "";
      return providerValidationResults.every((r: any) => r.live_ok);
    } catch (e) {
      validationError = `Validation failed: ${(e as Error).message}`;
      return false;
    } finally {
      validating = false;
    }
  }

  async function validateChannels(): Promise<boolean> {
    validating = true;
    validationError = "";
    validationWarning = "";
    channelValidationResults = [];

    const hasNonDefaultChannels = Object.keys(channels).some(
      (k) => k !== "web" && k !== "cli",
    );
    if (!hasNonDefaultChannels) {
      validating = false;
      return true;
    }

    try {
      const result = await api.validateChannels(component, channels);
      channelValidationResults = result.results || [];
      validationWarning = result.saved_channels_warning || "";
      return channelValidationResults.every((r: any) => r.live_ok);
    } catch (e) {
      validationError = `Validation failed: ${(e as Error).message}`;
      return false;
    } finally {
      validating = false;
    }
  }

  async function handleNext() {
    const page = pageKinds[currentPage];
    if (page === "setup") {
      if (instanceNameError) {
        validationError = instanceNameError;
        return;
      }
      if (providerStep) {
        const valid = await validateProviders();
        if (!valid) return;
      }
      currentPage += 1;
      validationError = "";
      return;
    }

    if (page === "channels") {
      const valid = await validateChannels();
      if (!valid) return;
      currentPage += 1;
      validationError = "";
    }
  }

  function handleBack() {
    if (currentPage > 0) {
      currentPage -= 1;
      validationError = "";
    }
  }

  async function submit() {
    installing = true;
    installMessage = "Installing...";
    try {
      const { _providers, ...rest } = answers;
      const payload: any = {
        instance_name: trimmedInstanceName,
        version: selectedVersion,
        ...rest,
      };
      if (_providers) {
        try {
          const rawProviders = JSON.parse(_providers);
          const customError = customProviderError(rawProviders);
          if (customError) throw new Error(customError);
          const parsed = normalizeProviderEntries(rawProviders);
          payload.providers = parsed;
          if (parsed.length > 0) {
            payload.provider = parsed[0].provider;
            payload.api_key = parsed[0].api_key || "";
            payload.model = parsed[0].model || "";
            if (parsed[0].base_url) payload.base_url = parsed[0].base_url;
          }
        } catch (e) {
          throw e;
        }
      }
      if (Object.keys(channels).length > 0) {
        payload.channels = channels;
      }
      const result = await api.postWizard(component, payload);
      installMessage = result.message || "Installation complete!";
      setTimeout(() => onComplete?.(), 1500);
    } catch (e) {
      installMessage = `Error: ${(e as Error).message}`;
    } finally {
      installing = false;
    }
  }
</script>

<Card class="gap-0 overflow-hidden px-0 py-0">
  <div class="border-b px-6 py-5">
    <h2 class="mb-4 text-lg font-semibold text-foreground">Install {component}</h2>
    <div class="flex items-center">
      {#each pageLabels as label, i}
        <button
          type="button"
          class="flex items-center gap-2 disabled:cursor-default {i <= currentPage
            ? 'cursor-pointer'
            : ''}"
          disabled={i > currentPage}
          onclick={() => { if (i < currentPage) currentPage = i; }}
        >
          <span
            class="flex size-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors {currentPage >=
            i
              ? 'border-foreground bg-foreground text-background'
              : 'border-border bg-background text-muted-foreground'}"
          >
            {#if currentPage > i}
              <CheckIcon class="size-3.5" />
            {:else}
              {i + 1}
            {/if}
          </span>
          <span
            class="text-sm font-medium transition-colors {currentPage === i
              ? 'text-foreground'
              : currentPage > i
                ? 'text-foreground'
                : 'text-muted-foreground'}"
          >
            {label}
          </span>
        </button>
        {#if i < pageLabels.length - 1}
          <div
            class="mx-3 h-px flex-1 transition-colors {currentPage > i
              ? 'bg-foreground'
              : 'bg-border'}"
          ></div>
        {/if}
      {/each}
    </div>
  </div>

  <div class="px-6 py-6">
    {#if pageKinds[currentPage] === "setup"}
      <div class="mb-6">
        <Label for={instanceNameId} class="mb-1 block">Instance name</Label>
        <p class="mb-2 text-sm text-muted-foreground">
          Name doesn't matter, just needs to be unique
        </p>
        <Input
          id={instanceNameId}
          type="text"
          bind:value={instanceName}
          placeholder={`${component}-1`}
        />
        {#if instanceNameError}
          <p class="mt-2 text-sm text-destructive">{instanceNameError}</p>
        {/if}
      </div>

      {#if versions.length > 0}
        <div class="mb-6">
          <Label for="version-picker" class="mb-2 block">Version</Label>
          <Select
            id="version-picker"
            value={selectedVersion}
            onchange={(e) => setSelectedVersion(e.currentTarget.value)}
          >
            {#each versions as v, i}
              <option value={v.value}>
                {v.label}{i === 0 ? " (latest, recommended)" : ""}
              </option>
            {/each}
          </Select>
        </div>
      {/if}

      {#if providerStep}
        <ProviderList
          providers={providerStep.options || []}
          value={answers["_providers"] || "[]"}
          onchange={(v) => (answers["_providers"] = v)}
          {component}
          validationResults={providerValidationResults}
        />
      {/if}
    {:else if pageKinds[currentPage] === "channels"}
      <ChannelList
        value={channels}
        onchange={(v) => (channels = v)}
        validationResults={channelValidationResults}
      />
    {:else}
      {#each settingsSteps as step}
        <WizardStep
          {step}
          value={answers[step.id] || ""}
          onchange={(v) => (answers[step.id] = v)}
        />
      {/each}

      {#if advancedSteps.length > 0}
        <Button
          variant="ghost"
          size="sm"
          class="mt-2 w-full justify-start gap-2 text-muted-foreground"
          onclick={() => (showAdvanced = !showAdvanced)}
        >
          {#if showAdvanced}
            <ChevronDownIcon class="size-4" />
          {:else}
            <ChevronRightIcon class="size-4" />
          {/if}
          Advanced
        </Button>

        {#if showAdvanced}
          <div class="mt-3 rounded-md border bg-muted/40 p-4">
            {#each advancedSteps as step}
              <WizardStep
                {step}
                value={answers[step.id] || ""}
                onchange={(v) => (answers[step.id] = v)}
              />
            {/each}
          </div>
        {/if}
      {/if}
    {/if}
  </div>

  {#if validationError}
    <div class="border-t border-destructive/30 bg-destructive/5 px-6 py-3 text-sm font-medium text-destructive">
      {validationError}
    </div>
  {/if}

  {#if validationWarning}
    <div class="border-t border-amber-300 bg-amber-50 px-6 py-3 text-sm font-medium text-amber-700">
      {validationWarning}
    </div>
  {/if}

  {#if installMessage}
    <div class="border-t bg-muted/40 px-6 py-3 text-sm font-medium text-foreground">
      {installMessage}
    </div>
  {/if}

  <div class="flex items-center border-t px-6 py-4">
    {#if currentPage > 0}
      <Button variant="outline" onclick={handleBack} disabled={validating || installing}>
        Back
      </Button>
    {/if}
    <div class="flex-1"></div>
    {#if currentPage < pageKinds.length - 1}
      <Button onclick={handleNext} disabled={validating || !!instanceNameError}>
        {validating ? "Validating..." : "Next"}
      </Button>
    {:else}
      <Button onclick={submit} disabled={installing || !!instanceNameError}>
        {installing ? "Installing..." : "Install"}
      </Button>
    {/if}
  </div>
</Card>
