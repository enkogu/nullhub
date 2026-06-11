<script lang="ts">
  import WizardShell, { type WizardShellStep } from "./WizardShell.svelte";
  import { api } from "$lib/api/client";
  import { Card } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Select } from "$lib/components/ui/select";
  import { Textarea } from "$lib/components/ui/textarea";

  type HirePayload = {
    instance_name: string;
    version: string;
    role: string;
    model: string;
    skills: string[];
  };

  let {
    component = "nullclaw",
    existingNames = [],
    availableModels = [],
    defaultVersion = "latest",
    onCreated,
    class: className,
  }: {
    component?: string;
    existingNames?: string[];
    availableModels?: string[];
    defaultVersion?: string;
    onCreated?: (result: any) => void;
    class?: string;
  } = $props();

  let activeStepId = $state("name");
  let name = $state("");
  let role = $state("");
  let model = $state("");
  let skills = $state("");
  let submitting = $state(false);
  let submitError = $state("");
  let submitMessage = $state("");
  let modelSeeded = $state(false);

  const steps: WizardShellStep[] = $derived([
    {
      id: "name",
      title: "Name",
      description: "Pick a unique agent name.",
      completed: Boolean(name.trim()) && !existingNames.includes(name.trim()),
      error: name.trim() && existingNames.includes(name.trim()) ? "This name already exists." : "",
    },
    {
      id: "role",
      title: "Role",
      description: "Describe what this agent does.",
      completed: Boolean(role.trim()),
    },
    {
      id: "model",
      title: "Model",
      description: "Choose the default model for this hire.",
      completed: Boolean(model.trim()),
    },
    {
      id: "skills",
      title: "Skills",
      description: "List the skills, comma-separated.",
      optional: true,
      completed: true,
    },
    {
      id: "review",
      title: "Review",
      description: "Confirm the hire before creating the instance.",
      completed: false,
    },
  ]);

  const skillsList = $derived(
    skills
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  const canSubmit = $derived(
    Boolean(name.trim()) &&
      !existingNames.includes(name.trim()) &&
      Boolean(role.trim()) &&
      Boolean(model.trim()) &&
      !submitting,
  );

  $effect(() => {
    if (modelSeeded) return;
    if (availableModels.length > 0) {
      model = availableModels[0];
      modelSeeded = true;
      return;
    }
    if (!model.trim()) {
      model = "google/gemma-4-31b-it:free";
    }
  });

  function validateStep(step: WizardShellStep) {
    if (step.id === "name") {
      if (!name.trim()) return "Enter a unique agent name.";
      if (existingNames.includes(name.trim())) return "That name is already in use.";
    }
    if (step.id === "role" && !role.trim()) return "Enter an agent role.";
    if (step.id === "model" && !model.trim()) return "Choose a model.";
    return true;
  }

  function parsedPayload(): HirePayload {
    return {
      instance_name: name.trim(),
      version: defaultVersion,
      role: role.trim(),
      model: model.trim(),
      skills: skillsList,
    };
  }

  async function submitHire() {
    if (!canSubmit) return;
    submitting = true;
    submitError = "";
    submitMessage = "";
    try {
      const result = await api.postWizard(component, parsedPayload());
      submitMessage = result?.message || `Created ${name.trim()}.`;
      onCreated?.(result);
    } catch (error) {
      submitError = (error as Error).message || "Failed to create the agent.";
    } finally {
      submitting = false;
    }
  }
</script>

<WizardShell
  class={`hire-wizard ${className || ""}`}
  title="Hire agent"
  description="Create a new instance with a name, role, model, and skills."
  steps={steps}
  bind:activeStepId
  validateStep={validateStep}
  onComplete={submitHire}
  nextLabel="Continue"
  completeLabel={submitting ? "Hiring..." : "Hire"}
>
  {#snippet children(step)}
    {#if step.id === "name"}
      <div class="space-y-3">
        <div class="space-y-1.5">
          <Label for="hire-name">Agent name</Label>
          <Input id="hire-name" bind:value={name} placeholder="sdr-agent" autocomplete="off" />
        </div>
        <p class="text-xs text-muted-foreground">This becomes the instance name.</p>
      </div>
    {:else if step.id === "role"}
      <div class="space-y-3">
        <div class="space-y-1.5">
          <Label for="hire-role">Role</Label>
          <Input id="hire-role" bind:value={role} placeholder="sales" autocomplete="off" />
        </div>
        <p class="text-xs text-muted-foreground">Use the user-facing role name the team will scan for.</p>
      </div>
    {:else if step.id === "model"}
      <div class="space-y-3">
        {#if availableModels.length > 0}
          <div class="space-y-1.5">
            <Label for="hire-model">Model</Label>
            <Select id="hire-model" bind:value={model}>
              {#each availableModels as item (item)}
                <option value={item}>{item}</option>
              {/each}
            </Select>
          </div>
        {:else}
          <div class="space-y-1.5">
            <Label for="hire-model">Model</Label>
            <Input id="hire-model" bind:value={model} placeholder="google/gemma-4-31b-it:free" autocomplete="off" />
          </div>
        {/if}
        <p class="text-xs text-muted-foreground">This is the default model passed to the instance wizard.</p>
      </div>
    {:else if step.id === "skills"}
      <div class="space-y-3">
        <div class="space-y-1.5">
          <Label for="hire-skills">Skills</Label>
          <Textarea
            id="hire-skills"
            bind:value={skills}
            placeholder="sales, follow-up, qualification"
            rows={5}
          />
        </div>
        <p class="text-xs text-muted-foreground">Separate skills with commas or new lines.</p>
      </div>
    {:else}
      <div class="space-y-4">
        <Card class="gap-4 px-4 py-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
              <p class="mt-1 text-sm text-foreground">{name.trim() || "-"}</p>
            </div>
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</p>
              <p class="mt-1 text-sm text-foreground">{role.trim() || "-"}</p>
            </div>
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Model</p>
              <p class="mt-1 text-sm text-foreground">{model.trim() || "-"}</p>
            </div>
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Skills</p>
              <p class="mt-1 text-sm text-foreground">{skillsList.length > 0 ? skillsList.join(", ") : "None"}</p>
            </div>
          </div>
        </Card>
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
