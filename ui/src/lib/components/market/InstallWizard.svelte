<script lang="ts">
  import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
  import CheckCircle2Icon from "@lucide/svelte/icons/check-circle-2";
  import KeyRoundIcon from "@lucide/svelte/icons/key-round";
  import UsersIcon from "@lucide/svelte/icons/users";
  import type { Space } from "$lib/api/client";
  import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
  import WizardShell, { type WizardShellStep } from "$lib/components/WizardShell.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Select } from "$lib/components/ui/select";
  import { Switch } from "$lib/components/ui/switch";
  import { PageHeader } from "$lib/components/ui/page-header";
  import type { PackageManifest, PackageRequirement } from "$lib/api/packages";
  import { packageBlastRadius, packageRequirementSummary } from "./market";
  import {
    mapRolesToAgents,
    packageBlastRadiusItems,
    packageDependencyRequirements,
    packageInstallLabel,
    packageSecretRequirements,
    packageStaffingRoles,
    staffingComplete,
    validateInstallStep,
    type InstallAgentOption,
    type InstallPayload,
    type InstallStaffingMap,
    type InstallWizardStepId,
  } from "./installWizard";
  let {
    pkg = null,
    installed = false,
    state: viewState = "populated",
    error,
    spaces = [],
    selectedSpaceId = "",
    agents = [],
    agentsState = "populated",
    agentsError,
    initialStepId = "preview",
    onRetry,
    onRefreshAgents,
    onEnact,
    class: className,
  }: {
    pkg?: PackageManifest | null;
    installed?: boolean;
    state?: DataStateKind;
    error?: unknown;
    spaces?: Space[];
    selectedSpaceId?: string | null;
    agents?: InstallAgentOption[];
    agentsState?: DataStateKind;
    agentsError?: unknown;
    initialStepId?: InstallWizardStepId;
    onRetry?: () => void;
    onRefreshAgents?: () => void;
    onEnact?: (payload: InstallPayload) => void | Promise<void>;
    class?: string;
  } = $props();
  let activeStepId = $state<InstallWizardStepId>("preview");
  let targetSpaceId = $state("");
  let previewAccepted = $state(false);
  let secretConfirmations = $state<Record<string, boolean>>({});
  let dependenciesAcknowledged = $state(false);
  let staffingMap = $state<InstallStaffingMap>({});
  let configName = $state("");
  let autonomy = $state<"review_required" | "auto_start_paused">("review_required");
  let enableAfterInstall = $state(false);
  let enactAccepted = $state(false);
  let submitMessage = $state("");
  let submitError = $state("");
  let seededPackageId = $state("");
  let seededInitialStep = $state(false);
  let installKind = $derived(pkg ? packageInstallLabel(pkg) : "Package");
  let secretRequirements = $derived(pkg ? packageSecretRequirements(pkg) : []);
  let dependencyRequirements = $derived(pkg ? packageDependencyRequirements(pkg) : []);
  let staffingRoles = $derived(pkg ? packageStaffingRoles(pkg) : []);
  let blastRadiusItems = $derived(pkg ? packageBlastRadiusItems(pkg) : []);
  let selectedSpace = $derived(spaces.find((space) => space.id === targetSpaceId));
  let allSecretsConfirmed = $derived(secretRequirements.every((item) => secretConfirmations[requirementKey(item)]));
  let dependenciesComplete = $derived(dependencyRequirements.length === 0 || dependenciesAcknowledged);
  let staffingReady = $derived(staffingComplete(staffingRoles, staffingMap, agentsState));
  let installPayload = $derived(pkg && targetSpaceId ? buildPayload(pkg) : null);
  let steps: WizardShellStep[] = $derived([
    {
      id: "preview",
      title: "Preview",
      description: "Space target, package contents, blast radius.",
      completed: Boolean(targetSpaceId && previewAccepted),
    },
    {
      id: "connect",
      title: "Connect",
      description: "Secret refs and dependencies.",
      completed: allSecretsConfirmed && dependenciesComplete,
    },
    {
      id: "staff",
      title: "Staff",
      description: "Role to agent ownership.",
      completed: staffingReady,
    },
    {
      id: "configure",
      title: "Configure",
      description: "Install name and activation policy.",
      completed: Boolean(configName.trim()),
    },
    {
      id: "enact",
      title: "Enact",
      description: "Final review before go-live.",
      completed: enactAccepted,
    },
  ]);
  $effect(() => {
    if (seededInitialStep) return;
    activeStepId = initialStepId;
    seededInitialStep = true;
  });
  $effect(() => {
    if (typeof selectedSpaceId === "string" && selectedSpaceId && !targetSpaceId) {
      targetSpaceId = selectedSpaceId;
    } else if (!targetSpaceId && spaces.length === 1) {
      targetSpaceId = spaces[0].id;
    }
  });
  $effect(() => {
    if (!pkg || seededPackageId === pkg.id) return;
    seededPackageId = pkg.id;
    activeStepId = initialStepId;
    previewAccepted = false;
    dependenciesAcknowledged = dependencyRequirements.length === 0;
    secretConfirmations = Object.fromEntries(secretRequirements.map((item) => [requirementKey(item), false]));
    staffingMap = mapRolesToAgents(staffingRoles, agents, {});
    configName = pkg.name;
    autonomy = "review_required";
    enableAfterInstall = false;
    enactAccepted = false;
    submitMessage = "";
    submitError = "";
  });
  $effect(() => {
    const next = mapRolesToAgents(staffingRoles, agents, staffingMap);
    if (!sameMap(next, staffingMap)) staffingMap = next;
  });
  function requirementKey(requirement: PackageRequirement): string {
    return requirement.secretRef || requirement.name || requirement.id || requirement.kind;
  }
  function sameMap(a: InstallStaffingMap, b: InstallStaffingMap): boolean {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && aKeys.every((key) => a[key] === b[key]);
  }
  function setSecretConfirmed(key: string, value: boolean) {
    secretConfirmations = { ...secretConfirmations, [key]: value };
  }
  function setStaffing(roleId: string, agentId: string) {
    staffingMap = { ...staffingMap, [roleId]: agentId };
  }
  function selectedAgent(agentId: string) {
    return agents.find((agent) => agent.id === agentId);
  }
  function validateStep(step: WizardShellStep) {
    return validateInstallStep(step.id as InstallWizardStepId, {
      selectedSpaceId: targetSpaceId || null,
      previewAccepted,
      secretConfirmations,
      dependenciesAcknowledged: dependenciesComplete,
      agentsState,
      roles: staffingRoles,
      staffingMap,
      configName,
      enactAccepted,
    }) || true;
  }
  function buildPayload(source: PackageManifest): InstallPayload {
    return {
      packageId: source.id,
      packageVersion: source.version,
      spaceId: targetSpaceId,
      configName: configName.trim(),
      autonomy,
      enableAfterInstall,
      staffing: staffingRoles
        .map((role) => ({
          roleId: role.id,
          role: role.label,
          agentId: staffingMap[role.id] || "",
        }))
        .filter((item) => item.agentId),
    };
  }
  async function enactInstall() {
    if (!installPayload) return;
    submitError = "";
    submitMessage = "";
    try {
      await onEnact?.(installPayload);
      submitMessage = `${pkg?.name || "Package"} install plan is staged for ${selectedSpace?.name || targetSpaceId}.`;
    } catch (err) {
      submitError = (err as Error).message || "Install plan could not be staged.";
    }
  }
</script>
<section class={className} data-slot="install-wizard">
  <PageHeader
    title={pkg?.name ?? "Install package"}
    subtitle={pkg?.summary ?? "Preview package contents, connections, staff, configuration, and enactment."}
    align="start"
  >
    {#snippet actions()}
      <Button href="/market" variant="outline" size="sm">Market</Button>
    {/snippet}
  </PageHeader>
  <DataState
    state={viewState}
    {error}
    loadingTitle="Loading install wizard"
    loadingDescription="Reading the built-in package catalog."
    emptyTitle="Package not found"
    emptyDescription="The requested package is not present in the built-in catalog."
    emptyActionLabel="Open Market"
    emptyActionHref="/market"
    errorTitle="Install wizard unavailable"
    retryLabel="Retry"
    onRetry={onRetry}
    class="mt-5"
  >
    {#if pkg}
      <WizardShell
        title={`${installKind} install`}
        description="Preview everything before this package is staged for the selected Space."
        steps={steps}
        bind:activeStepId
        validateStep={validateStep}
        onComplete={enactInstall}
        completeLabel="Stage install"
        class="mt-5"
      >
        {#snippet children(step)}
          {#if step.id === "preview"}
            <div class="space-y-4">
              <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <Card class="gap-4 px-4 py-4">
                  <div class="flex flex-wrap gap-2">
                    <Badge variant="outline">{pkg.scale}</Badge>
                    <Badge variant={pkg.stage === "blueprint" ? "default" : "secondary"}>{pkg.stageLabel}</Badge>
                    <Badge variant="muted">{pkg.itemTypeLabel}</Badge>
                    {#if installed}
                      <Badge variant="success">Installed</Badge>
                    {/if}
                  </div>
                  <div>
                    <h4 class="text-sm font-semibold text-foreground">Blast radius</h4>
                    <p class="mt-1 text-sm leading-5 text-muted-foreground">{packageBlastRadius(pkg)}</p>
                  </div>
                  <div class="grid gap-2">
                    {#each blastRadiusItems as item (item)}
                      <div class="rounded-md border px-3 py-2 text-sm text-foreground">{item}</div>
                    {/each}
                  </div>
                </Card>

                <Card class="gap-4 px-4 py-4">
                  <div class="space-y-1.5">
                    <Label for="install-space">Space</Label>
                    <Select id="install-space" bind:value={targetSpaceId} aria-label="Space">
                      <option value="">Select one Space</option>
                      {#each spaces as space (space.id)}
                        <option value={space.id}>{space.name || space.id}</option>
                      {/each}
                    </Select>
                  </div>
                  <div class="text-sm text-muted-foreground">
                    {#if selectedSpace}
                      Installs into {selectedSpace.name || selectedSpace.id}.
                    {:else}
                      A concrete Space is required.
                    {/if}
                  </div>
                </Card>
              </div>

              <label class="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={previewAccepted}
                  aria-label="Accept install preview"
                  onclick={() => (previewAccepted = !previewAccepted)}
                />
                <span>I reviewed the package contents, Space target, and blast radius.</span>
              </label>
            </div>
          {:else if step.id === "connect"}
            <div class="grid gap-4 lg:grid-cols-2">
              <Card class="gap-4 px-4 py-4">
                <div class="flex items-start gap-3">
                  <KeyRoundIcon class="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <h4 class="text-sm font-semibold text-foreground">Required secrets</h4>
                    <p class="mt-1 text-sm leading-5 text-muted-foreground">{packageRequirementSummary(pkg)}</p>
                  </div>
                </div>
                {#if secretRequirements.length === 0}
                  <Badge variant="outline">No required secrets</Badge>
                {:else}
                  <div class="grid gap-2">
                    {#each secretRequirements as requirement (requirementKey(requirement))}
                      {@const key = requirementKey(requirement)}
                      <label class="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                        <Checkbox
                          checked={secretConfirmations[key] || false}
                          aria-label={`Confirm ${key}`}
                          onclick={() => setSecretConfirmed(key, !(secretConfirmations[key] || false))}
                        />
                        <span>
                          <span class="block font-medium text-foreground">{key}</span>
                          <span class="block text-muted-foreground">{requirement.name || "Secret reference"}</span>
                        </span>
                      </label>
                    {/each}
                  </div>
                {/if}
              </Card>

              <Card class="gap-4 px-4 py-4">
                <div class="flex items-start gap-3">
                  <AlertTriangleIcon class="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
                  <div>
                    <h4 class="text-sm font-semibold text-foreground">Dependencies</h4>
                    <p class="mt-1 text-sm leading-5 text-muted-foreground">Package and component prerequisites checked before staging.</p>
                  </div>
                </div>
                {#if dependencyRequirements.length === 0}
                  <Badge variant="outline">No package dependencies</Badge>
                {:else}
                  <div class="grid gap-2">
                    {#each dependencyRequirements as requirement (requirement.kind + requirement.name + requirement.id)}
                      <div class="rounded-md border px-3 py-2 text-sm">
                        <p class="font-medium text-foreground">{requirement.label}: {requirement.name || requirement.id}</p>
                        <p class="text-muted-foreground">{requirement.id || requirement.kind}</p>
                      </div>
                    {/each}
                  </div>
                  <label class="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={dependenciesAcknowledged}
                      aria-label="Acknowledge dependencies"
                      onclick={() => (dependenciesAcknowledged = !dependenciesAcknowledged)}
                    />
                    <span>I reviewed the package dependencies for this Space.</span>
                  </label>
                {/if}
              </Card>
            </div>
          {:else if step.id === "staff"}
            <Card class="gap-4 px-4 py-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="flex items-start gap-3">
                  <UsersIcon class="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <h4 class="text-sm font-semibold text-foreground">Staffing</h4>
                    <p class="mt-1 text-sm leading-5 text-muted-foreground">Every required role needs an owning agent before go-live.</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onclick={onRefreshAgents}>Refresh agents</Button>
              </div>

              <DataState
                state={agentsState}
                error={agentsError}
                loadingTitle="Loading agents"
                loadingDescription="Fetching NullClaw staff for this Space."
                emptyTitle="No agents available"
                emptyDescription="Create or import an agent before assigning package roles."
                errorTitle="Unable to load agents"
                retryLabel="Retry"
                onRetry={onRefreshAgents}
              >
                <div class="grid gap-3">
                  {#each staffingRoles as role (role.id)}
                    <div class="grid gap-3 rounded-md border px-3 py-3 md:grid-cols-[minmax(0,1fr)_16rem]">
                      <div class="min-w-0">
                        <p class="text-sm font-medium text-foreground">{role.label}</p>
                        <p class="mt-1 text-sm leading-5 text-muted-foreground">{role.description}</p>
                        {#if selectedAgent(staffingMap[role.id])}
                          <p class="mt-2 text-xs text-muted-foreground">
                            Assigned to {selectedAgent(staffingMap[role.id])?.name} ({selectedAgent(staffingMap[role.id])?.status})
                          </p>
                        {/if}
                      </div>
                      <div class="space-y-1.5">
                        <Label for={`staff-${role.id}`}>Agent</Label>
                        <Select
                          id={`staff-${role.id}`}
                          value={staffingMap[role.id] || ""}
                          aria-label={`Agent for ${role.label}`}
                          onchange={(event) => setStaffing(role.id, (event.currentTarget as HTMLSelectElement).value)}
                        >
                          <option value="">Select agent</option>
                          {#each agents as agent (agent.id)}
                            <option value={agent.id}>{agent.name} - {agent.role}</option>
                          {/each}
                        </Select>
                      </div>
                    </div>
                  {/each}
                </div>
              </DataState>
            </Card>
          {:else if step.id === "configure"}
            <div class="grid gap-4 lg:grid-cols-2">
              <Card class="gap-4 px-4 py-4">
                <div class="space-y-1.5">
                  <Label for="install-label">Install label</Label>
                  <Input id="install-label" bind:value={configName} autocomplete="off" />
                </div>
                <div class="space-y-1.5">
                  <Label for="install-autonomy">Activation policy</Label>
                  <Select id="install-autonomy" bind:value={autonomy} aria-label="Activation policy">
                    <option value="review_required">Review required</option>
                    <option value="auto_start_paused">Stage paused</option>
                  </Select>
                </div>
              </Card>

              <Card class="gap-4 px-4 py-4">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <Label for="install-enable">Enable after install</Label>
                    <p class="mt-1 text-sm leading-5 text-muted-foreground">Keep this off when the Space needs another review.</p>
                  </div>
                  <Switch id="install-enable" bind:checked={enableAfterInstall} aria-label="Enable after install" />
                </div>
              </Card>
            </div>
          {:else}
            <div class="space-y-4">
              <Card class="gap-4 px-4 py-4">
                <div class="flex items-start gap-3">
                  <CheckCircle2Icon class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h4 class="text-sm font-semibold text-foreground">Final review</h4>
                    <p class="mt-1 text-sm leading-5 text-muted-foreground">No backend install is executed from this screen in this release.</p>
                  </div>
                </div>
                <dl class="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <dt class="text-muted-foreground">Package</dt>
                    <dd class="font-medium text-foreground">{pkg.name} v{pkg.version}</dd>
                  </div>
                  <div>
                    <dt class="text-muted-foreground">Space</dt>
                    <dd class="font-medium text-foreground">{selectedSpace?.name || targetSpaceId || "-"}</dd>
                  </div>
                  <div>
                    <dt class="text-muted-foreground">Install label</dt>
                    <dd class="font-medium text-foreground">{configName || "-"}</dd>
                  </div>
                  <div>
                    <dt class="text-muted-foreground">Staffed roles</dt>
                    <dd class="font-medium text-foreground">{installPayload?.staffing.length || 0}</dd>
                  </div>
                </dl>
              </Card>

              <label class="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={enactAccepted}
                  aria-label="Confirm enactment review"
                  onclick={() => (enactAccepted = !enactAccepted)}
                />
                <span>I confirm this package is ready to be staged for the selected Space.</span>
              </label>

              {#if submitError}
                <p class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {submitError}
                </p>
              {:else if submitMessage}
                <p class="rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">
                  {submitMessage}
                </p>
              {/if}
            </div>
          {/if}
        {/snippet}
      </WizardShell>
    {/if}
  </DataState>
</section>
