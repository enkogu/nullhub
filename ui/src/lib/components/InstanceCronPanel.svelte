<script lang="ts">
  import { api, type CronJobCreateRequest, type CronJobUpdateRequest } from "$lib/api/client";
  import { Card } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Select } from "$lib/components/ui/select";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Label } from "$lib/components/ui/label";
  import { Badge, type BadgeVariant } from "$lib/components/ui/badge";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import XIcon from "@lucide/svelte/icons/x";
  import PlayIcon from "@lucide/svelte/icons/play";
  import PauseIcon from "@lucide/svelte/icons/pause";
  import PowerIcon from "@lucide/svelte/icons/power";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import SaveIcon from "@lucide/svelte/icons/save";

  type CronJob = {
    id?: string;
    expression?: string;
    command?: string;
    prompt?: string;
    model?: string;
    session_target?: string;
    paused?: boolean;
    enabled?: boolean;
    one_shot?: boolean;
    job_type?: string;
    delete_after_run?: boolean;
    [key: string]: any;
  };

  type CronRun = {
    id?: string | number;
    job_id?: string;
    started_at_s?: number;
    finished_at_s?: number;
    status?: string;
    output?: string;
    duration_ms?: number;
    [key: string]: any;
  };

  type ScheduleMode = "recurring" | "once";
  type PayloadMode = "shell" | "agent";
  type JobFilter = "all" | "active" | "paused" | "recurring" | "one-shot" | "shell" | "agent";

  let { component, name, active = false } = $props<{
    component: string;
    name: string;
    active?: boolean;
  }>();

  let jobs = $state<CronJob[]>([]);
  let selectedJobId = $state("");
  let selectedJobDetail = $state<CronJob | null>(null);
  let runs = $state<CronRun[]>([]);
  let loadingJobs = $state(false);
  let loadingDetail = $state(false);
  let loadingRuns = $state(false);
  let actionLoading = $state<string | null>(null);
  let error = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let message = $state<string | null>(null);
  let loadedKey = $state("");
  let requestSeq = 0;
  let detailSeq = 0;
  let runsSeq = 0;
  let search = $state("");
  let filter = $state<JobFilter>("all");
  let runLimit = $state("10");
  let showCreate = $state(false);
  let createScheduleMode = $state<ScheduleMode>("recurring");
  let createPayloadMode = $state<PayloadMode>("shell");
  let createExpression = $state("*/10 * * * *");
  let createDelay = $state("5m");
  let createCommand = $state("");
  let createPrompt = $state("");
  let createModel = $state("");
  let createSessionTarget = $state("");
  let createAnnounce = $state(false);
  let createDeliveryChannel = $state("");
  let createDeliveryAccountId = $state("");
  let createDeliveryTo = $state("");
  let editExpression = $state("");
  let editPayloadMode = $state<PayloadMode>("shell");
  let editCommand = $state("");
  let editPrompt = $state("");
  let editModel = $state("");
  let editSessionTarget = $state("");
  let editEnabled = $state(true);

  const instanceKey = $derived(`${component}/${name}`);
  const selectedJob = $derived(
    selectedJobDetail || jobs.find((job) => jobId(job) === selectedJobId) || null,
  );
  const filteredJobs = $derived(
    jobs.filter((job) => {
      const haystack = [
        jobId(job),
        job.expression,
        job.command,
        job.prompt,
        job.model,
        job.session_target,
        job.job_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const query = search.trim().toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (filter === "active") return !isPaused(job) && !isDisabled(job);
      if (filter === "paused") return isPaused(job) || isDisabled(job);
      if (filter === "recurring") return !isOneShot(job);
      if (filter === "one-shot") return isOneShot(job);
      if (filter === "shell") return payloadMode(job) === "shell";
      if (filter === "agent") return payloadMode(job) === "agent";
      return true;
    }),
  );
  const totalJobs = $derived(jobs.length);
  const activeJobs = $derived(jobs.filter((job) => !isPaused(job) && !isDisabled(job)).length);
  const pausedJobs = $derived(jobs.filter((job) => isPaused(job) || isDisabled(job)).length);
  const oneShotJobs = $derived(jobs.filter((job) => isOneShot(job)).length);

  $effect(() => {
    if (!active || !component || !name) return;
    const nextKey = instanceKey;
    if (loadedKey === nextKey) return;
    resetPanel();
    void loadJobs(true);
  });

  function resetPanel() {
    jobs = [];
    selectedJobId = "";
    selectedJobDetail = null;
    runs = [];
    error = null;
    actionError = null;
    message = null;
    loadedKey = "";
  }

  function jobId(job: CronJob | null | undefined): string {
    return String(job?.id || "");
  }

  function isOneShot(job: CronJob): boolean {
    return Boolean(job.one_shot) || job.expression === "@once";
  }

  function isDisabled(job: CronJob): boolean {
    return job.enabled === false;
  }

  function isPaused(job: CronJob): boolean {
    return Boolean(job.paused);
  }

  function payloadMode(job: CronJob | null | undefined): PayloadMode {
    const jobType = String(job?.job_type || "").toLowerCase();
    if (jobType === "agent") return "agent";
    if (jobType === "shell") return "shell";
    if (job?.prompt) return "agent";
    return "shell";
  }

  function jobStatus(job: CronJob): string {
    if (isDisabled(job)) return "disabled";
    if (isPaused(job)) return "paused";
    if (isOneShot(job)) return "one-shot";
    return "active";
  }

  function statusVariant(job: CronJob): BadgeVariant {
    const status = jobStatus(job);
    if (status === "paused" || status === "disabled") return "warning";
    if (status === "active" || status === "one-shot") return "success";
    return "muted";
  }

  function scheduleText(job: CronJob | null | undefined): string {
    if (!job) return "-";
    if (isOneShot(job)) return job.expression && job.expression !== "@once" ? job.expression : "@once";
    return job.expression || "-";
  }

  function payloadPreview(job: CronJob | null | undefined): string {
    const value = job?.prompt || job?.command || "";
    return value.split(/\r?\n/)[0] || "-";
  }

  function jobType(job: CronJob): string {
    if (job.job_type) return String(job.job_type);
    return payloadMode(job) === "agent" ? "agent" : "shell";
  }

  function formatRunTime(seconds: number | undefined): string {
    if (!seconds) return "-";
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
  }

  function formatDuration(value: number | undefined): string {
    if (value == null) return "-";
    if (value < 1000) return `${value}ms`;
    return `${(value / 1000).toFixed(1)}s`;
  }

  function errorMessage(errorValue: unknown, fallback: string): string {
    return (errorValue as Error)?.message || fallback;
  }

  function normalizeJobs(result: any): CronJob[] {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.jobs)) return result.jobs;
    return [];
  }

  function normalizeRuns(result: any): CronRun[] {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.runs)) return result.runs;
    return [];
  }

  function mergeJob(job: CronJob | null | undefined) {
    const id = jobId(job);
    if (!job || !id) return;
    const index = jobs.findIndex((item) => jobId(item) === id);
    if (index >= 0) {
      jobs = jobs.map((item, i) => (i === index ? { ...item, ...job } : item));
    } else {
      jobs = [job, ...jobs];
    }
    selectedJobId = id;
    selectedJobDetail = job;
    syncEditDraft(job);
  }

  async function loadJobs(force = false) {
    if (!active || !component || !name) return;
    const contextKey = instanceKey;
    if (!force && loadedKey === contextKey) return;
    const req = ++requestSeq;
    loadingJobs = true;
    error = null;
    try {
      const result = await api.getCronJobs(component, name);
      if (req !== requestSeq || contextKey !== instanceKey || !active) return;
      jobs = normalizeJobs(result);
      loadedKey = contextKey;
      if (selectedJobId && jobs.some((job) => jobId(job) === selectedJobId)) {
        await loadSelectedJob(selectedJobId, false);
      } else if (jobs.length > 0) {
        selectJob(jobId(jobs[0]));
      } else {
        selectedJobId = "";
        selectedJobDetail = null;
        runs = [];
      }
    } catch (err) {
      if (req !== requestSeq || contextKey !== instanceKey || !active) return;
      error = errorMessage(err, "Failed to load cron jobs.");
    } finally {
      if (req === requestSeq && contextKey === instanceKey) {
        loadingJobs = false;
      }
    }
  }

  function selectJob(id: string) {
    if (!id) return;
    selectedJobId = id;
    selectedJobDetail = jobs.find((job) => jobId(job) === id) || null;
    if (selectedJobDetail) syncEditDraft(selectedJobDetail);
    runs = [];
    void loadSelectedJob(id, true);
  }

  async function loadSelectedJob(id = selectedJobId, includeRuns = true) {
    if (!active || !id) return;
    const contextKey = instanceKey;
    const req = ++detailSeq;
    loadingDetail = true;
    actionError = null;
    try {
      const job = await api.getCronJob(component, name, id) as CronJob;
      if (req !== detailSeq || contextKey !== instanceKey || selectedJobId !== id || !active) return;
      mergeJob(job);
      if (includeRuns) await loadRuns(true);
    } catch (err) {
      if (req !== detailSeq || contextKey !== instanceKey || selectedJobId !== id || !active) return;
      actionError = errorMessage(err, "Failed to load cron job.");
    } finally {
      if (req === detailSeq && contextKey === instanceKey) {
        loadingDetail = false;
      }
    }
  }

  async function loadRuns(force = false) {
    if (!active || !selectedJobId) return;
    const contextKey = instanceKey;
    const jobKey = selectedJobId;
    const req = ++runsSeq;
    loadingRuns = true;
    if (force) actionError = null;
    try {
      const limit = Math.max(1, Number(runLimit) || 10);
      const result = await api.getCronRuns(component, name, jobKey, limit);
      if (req !== runsSeq || contextKey !== instanceKey || selectedJobId !== jobKey || !active) return;
      runs = normalizeRuns(result);
    } catch (err) {
      if (req !== runsSeq || contextKey !== instanceKey || selectedJobId !== jobKey || !active) return;
      actionError = errorMessage(err, "Failed to load cron runs.");
    } finally {
      if (req === runsSeq && contextKey === instanceKey) {
        loadingRuns = false;
      }
    }
  }

  function applyPreset(expression: string) {
    createExpression = expression;
  }

  function buildCreatePayload(): CronJobCreateRequest | null {
    actionError = null;
    const payload: CronJobCreateRequest = {};
    if (createScheduleMode === "recurring") {
      const expression = createExpression.trim();
      if (!expression) {
        actionError = "Cron expression is required.";
        return null;
      }
      payload.expression = expression;
    } else {
      const delay = createDelay.trim();
      if (!delay) {
        actionError = "Delay is required for one-shot jobs.";
        return null;
      }
      payload.delay = delay;
    }
    if (createPayloadMode === "shell") {
      const command = createCommand.trim();
      if (!command) {
        actionError = "Command is required.";
        return null;
      }
      payload.command = command;
      return payload;
    }
    const prompt = createPrompt.trim();
    if (!prompt) {
      actionError = "Prompt is required.";
      return null;
    }
    payload.prompt = prompt;
    if (createModel.trim()) payload.model = createModel.trim();
    if (createSessionTarget.trim()) payload.session_target = createSessionTarget.trim();
    if (createAnnounce) payload.announce = true;
    if (createDeliveryChannel.trim()) payload.delivery_channel = createDeliveryChannel.trim();
    if (createDeliveryAccountId.trim()) payload.delivery_account_id = createDeliveryAccountId.trim();
    if (createDeliveryTo.trim()) payload.delivery_to = createDeliveryTo.trim();
    return payload;
  }

  function clearCreateDraft() {
    createCommand = "";
    createPrompt = "";
    createModel = "";
    createSessionTarget = "";
    createAnnounce = false;
    createDeliveryChannel = "";
    createDeliveryAccountId = "";
    createDeliveryTo = "";
  }

  async function createJob() {
    const payload = buildCreatePayload();
    if (!payload) return;
    actionLoading = "create";
    actionError = null;
    message = null;
    try {
      const result = createScheduleMode === "once"
        ? await api.createOneShotCronJob(component, name, payload)
        : await api.createCronJob(component, name, payload);
      const job = result?.job || result;
      mergeJob(job);
      showCreate = false;
      clearCreateDraft();
      message = `Created ${jobId(job) || "cron job"}.`;
      await loadJobs(true);
    } catch (err) {
      actionError = errorMessage(err, "Failed to create cron job.");
    } finally {
      actionLoading = null;
    }
  }

  function syncEditDraft(job: CronJob) {
    editExpression = job.expression || "";
    editPayloadMode = payloadMode(job);
    editCommand = job.command || "";
    editPrompt = job.prompt || "";
    editModel = job.model || "";
    editSessionTarget = job.session_target || "";
    editEnabled = job.enabled !== false;
  }

  function buildUpdatePayload(job: CronJob): CronJobUpdateRequest | null {
    const payload: CronJobUpdateRequest = {};
    const currentPayloadMode = payloadMode(job);
    if (editPayloadMode !== currentPayloadMode) {
      actionError = "Existing cron job type cannot be changed. Create a new job instead.";
      return null;
    }
    if (!isOneShot(job) && editExpression.trim() && editExpression.trim() !== (job.expression || "")) {
      payload.expression = editExpression.trim();
    }
    if (currentPayloadMode === "shell") {
      if (!editCommand.trim()) {
        actionError = "Command is required.";
        return null;
      }
      if (editCommand.trim() !== (job.command || "")) payload.command = editCommand.trim();
    } else {
      if (!editPrompt.trim()) {
        actionError = "Prompt is required.";
        return null;
      }
      if (editPrompt.trim() !== (job.prompt || "")) payload.prompt = editPrompt.trim();
      if (editModel.trim() !== (job.model || "")) payload.model = editModel.trim();
      if (editSessionTarget.trim() !== (job.session_target || "")) {
        payload.session_target = editSessionTarget.trim();
      }
    }
    if (editEnabled !== (job.enabled !== false)) payload.enabled = editEnabled;
    if (Object.keys(payload).length === 0) {
      actionError = "No changes to save.";
      return null;
    }
    return payload;
  }

  async function updateJob() {
    if (!selectedJob) return;
    const id = jobId(selectedJob);
    const payload = buildUpdatePayload(selectedJob);
    if (!payload) return;
    actionLoading = "update";
    actionError = null;
    message = null;
    try {
      const result = await api.updateCronJob(component, name, id, payload);
      const job = result?.job || result;
      mergeJob(job);
      message = `Updated ${id}.`;
      await loadJobs(true);
    } catch (err) {
      actionError = errorMessage(err, "Failed to update cron job.");
    } finally {
      actionLoading = null;
    }
  }

  async function runAction(kind: "run" | "pause" | "resume" | "enable") {
    if (!selectedJobId) return;
    actionLoading = kind;
    actionError = null;
    message = null;
    try {
      const result = kind === "run"
        ? await api.runCronJob(component, name, selectedJobId)
        : kind === "pause"
          ? await api.pauseCronJob(component, name, selectedJobId)
          : kind === "enable"
            ? await api.updateCronJob(component, name, selectedJobId, { enabled: true })
            : await api.resumeCronJob(component, name, selectedJobId);
      mergeJob(result?.job || result);
      message = `${kind === "run" ? "Ran" : kind === "pause" ? "Paused" : kind === "enable" ? "Enabled" : "Resumed"} ${selectedJobId}.`;
      await loadJobs(true);
      await loadRuns(true);
    } catch (err) {
      actionError = errorMessage(err, `Failed to ${kind} cron job.`);
    } finally {
      actionLoading = null;
    }
  }

  async function deleteJob() {
    if (!selectedJobId || !selectedJob) return;
    if (!confirm(`Delete cron job ${selectedJobId}? This cannot be undone.`)) return;
    const deletedId = selectedJobId;
    actionLoading = "delete";
    actionError = null;
    message = null;
    try {
      await api.deleteCronJob(component, name, deletedId);
      jobs = jobs.filter((job) => jobId(job) !== deletedId);
      selectedJobId = "";
      selectedJobDetail = null;
      runs = [];
      message = `Deleted ${deletedId}.`;
      await loadJobs(true);
    } catch (err) {
      actionError = errorMessage(err, "Failed to delete cron job.");
    } finally {
      actionLoading = null;
    }
  }
</script>

<section class="cron-panel">
  <div class="panel-header">
    <div>
      <h2>Cron Jobs</h2>
      <p>Manage scheduled shell commands and agent prompts for this NullClaw instance.</p>
    </div>
    <div class="header-actions">
      <Button variant="outline" size="icon" onclick={() => loadJobs(true)} disabled={loadingJobs} title="Refresh" aria-label="Refresh jobs">
        <RefreshCwIcon />
      </Button>
      <Button variant="default" size="sm" onclick={() => { createScheduleMode = "recurring"; showCreate = true; }}>
        <PlusIcon />
        New job
      </Button>
      <Button variant="outline" size="sm" onclick={() => { createScheduleMode = "once"; showCreate = true; }}>
        <PlusIcon />
        One-shot
      </Button>
    </div>
  </div>

  <div class="summary-strip">
    <Card class="summary-item px-5"><span>Total</span><strong>{totalJobs}</strong></Card>
    <Card class="summary-item px-5"><span>Active</span><strong>{activeJobs}</strong></Card>
    <Card class="summary-item px-5"><span>Paused</span><strong>{pausedJobs}</strong></Card>
    <Card class="summary-item px-5"><span>One-shot</span><strong>{oneShotJobs}</strong></Card>
  </div>

  {#if error}
    <div class="banner error-banner">{error}</div>
  {/if}
  {#if actionError}
    <div class="banner error-banner">{actionError}</div>
  {/if}
  {#if message}
    <div class="banner success-banner">{message}</div>
  {/if}

  {#if showCreate}
    <Card class="create-panel px-5">
      <div class="section-title">
        <h3>{createScheduleMode === "once" ? "Create one-shot job" : "Create recurring job"}</h3>
        <Button variant="ghost" size="icon-sm" onclick={() => (showCreate = false)} title="Close" aria-label="Close create panel">
          <XIcon />
        </Button>
      </div>

      <div class="form-grid">
        <div class="field">
          <Label for="cron-create-schedule-mode">Schedule</Label>
          <Select id="cron-create-schedule-mode" name="cron-create-schedule-mode" bind:value={createScheduleMode}>
            <option value="recurring">Recurring</option>
            <option value="once">One-shot</option>
          </Select>
        </div>
        <div class="field">
          <Label for="cron-create-payload-mode">Payload</Label>
          <Select id="cron-create-payload-mode" name="cron-create-payload-mode" bind:value={createPayloadMode}>
            <option value="shell">Shell command</option>
            <option value="agent">Agent prompt</option>
          </Select>
        </div>
      </div>

      {#if createScheduleMode === "recurring"}
        <div class="field">
          <Label for="cron-create-expression">Cron expression</Label>
          <Input id="cron-create-expression" name="cron-create-expression" bind:value={createExpression} placeholder="*/10 * * * *" />
        </div>
        <div class="preset-row">
          <Button variant="secondary" size="sm" onclick={() => applyPreset("*/5 * * * *")}>Every 5m</Button>
          <Button variant="secondary" size="sm" onclick={() => applyPreset("0 * * * *")}>Hourly</Button>
          <Button variant="secondary" size="sm" onclick={() => applyPreset("0 9 * * *")}>Daily</Button>
          <Button variant="secondary" size="sm" onclick={() => applyPreset("0 9 * * 1")}>Weekly</Button>
        </div>
      {:else}
        <div class="field">
          <Label for="cron-create-delay">Delay</Label>
          <Input id="cron-create-delay" name="cron-create-delay" bind:value={createDelay} placeholder="5m, 1h, 24h" />
        </div>
      {/if}

      {#if createPayloadMode === "shell"}
        <div class="field">
          <Label for="cron-create-command">Command</Label>
          <Textarea id="cron-create-command" class="mono-input" name="cron-create-command" bind:value={createCommand} rows={4} placeholder="echo heartbeat"></Textarea>
        </div>
      {:else}
        <div class="field">
          <Label for="cron-create-prompt">Prompt</Label>
          <Textarea id="cron-create-prompt" class="mono-input" name="cron-create-prompt" bind:value={createPrompt} rows={5} placeholder="Summarize recent activity"></Textarea>
        </div>
        <div class="form-grid">
          <div class="field">
            <Label for="cron-create-model">Model</Label>
            <Input id="cron-create-model" name="cron-create-model" bind:value={createModel} placeholder="optional" />
          </div>
          <div class="field">
            <Label for="cron-create-session-target">Session target</Label>
            <Input id="cron-create-session-target" name="cron-create-session-target" bind:value={createSessionTarget} placeholder="optional" />
          </div>
          <label class="checkbox-field">
            <input name="cron-create-announce" type="checkbox" bind:checked={createAnnounce} />
            <span>Announce result</span>
          </label>
          <div class="field">
            <Label for="cron-create-delivery-channel">Delivery channel</Label>
            <Input id="cron-create-delivery-channel" name="cron-create-delivery-channel" bind:value={createDeliveryChannel} placeholder="telegram" />
          </div>
          <div class="field">
            <Label for="cron-create-delivery-account">Delivery account</Label>
            <Input id="cron-create-delivery-account" name="cron-create-delivery-account" bind:value={createDeliveryAccountId} placeholder="optional" />
          </div>
          <div class="field">
            <Label for="cron-create-delivery-to">Recipient</Label>
            <Input id="cron-create-delivery-to" name="cron-create-delivery-to" bind:value={createDeliveryTo} placeholder="optional" />
          </div>
        </div>
      {/if}

      <div class="form-actions">
        <Button variant="default" onclick={createJob} disabled={actionLoading === "create"}>
          {actionLoading === "create" ? "Creating..." : "Create"}
        </Button>
      </div>
    </Card>
  {/if}

  <div class="cron-workspace">
    <Card class="jobs-pane px-5">
      <div class="toolbar">
        <div class="field">
          <Label for="cron-search">Search</Label>
          <Input id="cron-search" name="cron-search" bind:value={search} placeholder="Search jobs" />
        </div>
        <div class="field">
          <Label for="cron-filter">Filter</Label>
          <Select id="cron-filter" name="cron-filter" bind:value={filter}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="recurring">Recurring</option>
            <option value="one-shot">One-shot</option>
            <option value="shell">Shell</option>
            <option value="agent">Agent</option>
          </Select>
        </div>
      </div>

      <div class="job-list">
        {#if loadingJobs && jobs.length === 0}
          <div class="empty-row">Loading jobs...</div>
        {:else if filteredJobs.length === 0}
          <div class="empty-row">{jobs.length === 0 ? "No cron jobs" : "No jobs match the filter"}</div>
        {:else}
          {#each filteredJobs as job}
            <button
              class="job-row"
              class:active={jobId(job) === selectedJobId}
              onclick={() => selectJob(jobId(job))}
            >
              <Badge variant={statusVariant(job)}>{jobStatus(job)}</Badge>
              <span class="job-main">
                <strong>{jobId(job)}</strong>
                <span>{scheduleText(job)} / {jobType(job)}</span>
              </span>
              <span class="job-preview mono">{payloadPreview(job)}</span>
            </button>
          {/each}
        {/if}
      </div>
    </Card>

    <Card class="detail-pane px-5">
      {#if selectedJob}
        <div class="detail-header">
          <div>
            <h3>{jobId(selectedJob)}</h3>
            <Badge variant={statusVariant(selectedJob)}>{jobStatus(selectedJob)}</Badge>
          </div>
          {#if loadingDetail}<span class="muted">Loading detail...</span>{/if}
        </div>

        <div class="action-row">
          <Button variant="default" size="sm" onclick={() => runAction("run")} disabled={actionLoading !== null} title="Run now">
            <PlayIcon />
            Run now
          </Button>
          {#if isDisabled(selectedJob)}
            <Button variant="outline" size="sm" onclick={() => runAction("enable")} disabled={actionLoading !== null} title="Enable">
              <PowerIcon />
              Enable
            </Button>
          {:else if isPaused(selectedJob)}
            <Button variant="outline" size="sm" onclick={() => runAction("resume")} disabled={actionLoading !== null} title="Resume">
              <PlayIcon />
              Resume
            </Button>
          {:else}
            <Button variant="outline" size="sm" onclick={() => runAction("pause")} disabled={actionLoading !== null} title="Pause">
              <PauseIcon />
              Pause
            </Button>
          {/if}
          <Button variant="destructive" size="sm" onclick={deleteJob} disabled={actionLoading !== null} title="Delete">
            <Trash2Icon />
            Delete
          </Button>
        </div>

        <div class="edit-panel">
          <div class="section-title">
            <h3>Edit job</h3>
            <Button variant="ghost" size="sm" onclick={() => syncEditDraft(selectedJob)}>Reset</Button>
          </div>
          <div class="form-grid">
            <div class="field">
              <Label for="cron-edit-expression">Expression</Label>
              <Input id="cron-edit-expression" name="cron-edit-expression" bind:value={editExpression} disabled={isOneShot(selectedJob)} />
            </div>
            <div class="field">
              <Label for="cron-edit-payload-mode">Payload</Label>
              <Select id="cron-edit-payload-mode" name="cron-edit-payload-mode" bind:value={editPayloadMode} disabled>
                <option value="shell">Shell command</option>
                <option value="agent">Agent prompt</option>
              </Select>
            </div>
            <label class="checkbox-field">
              <input name="cron-edit-enabled" type="checkbox" bind:checked={editEnabled} />
              <span>Enabled</span>
            </label>
          </div>
          {#if isOneShot(selectedJob)}
            <p class="muted">One-shot schedule is read-only in the current backend API.</p>
          {/if}
          {#if editPayloadMode === "shell"}
            <div class="field">
              <Label for="cron-edit-command">Command</Label>
              <Textarea id="cron-edit-command" class="mono-input" name="cron-edit-command" bind:value={editCommand} rows={4}></Textarea>
            </div>
          {:else}
            <div class="field">
              <Label for="cron-edit-prompt">Prompt</Label>
              <Textarea id="cron-edit-prompt" class="mono-input" name="cron-edit-prompt" bind:value={editPrompt} rows={5}></Textarea>
            </div>
            <div class="form-grid">
              <div class="field">
                <Label for="cron-edit-model">Model</Label>
                <Input id="cron-edit-model" name="cron-edit-model" bind:value={editModel} />
              </div>
              <div class="field">
                <Label for="cron-edit-session-target">Session target</Label>
                <Input id="cron-edit-session-target" name="cron-edit-session-target" bind:value={editSessionTarget} />
              </div>
            </div>
          {/if}
          <div class="form-actions">
            <Button variant="default" onclick={updateJob} disabled={actionLoading === "update"}>
              <SaveIcon />
              {actionLoading === "update" ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>

        <div class="runs-panel">
          <div class="section-title">
            <h3>Run history</h3>
            <div class="inline-actions">
              <Select name="cron-run-limit" bind:value={runLimit} onchange={() => loadRuns(true)}>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </Select>
              <Button variant="outline" size="icon" onclick={() => loadRuns(true)} disabled={loadingRuns} title="Refresh runs" aria-label="Refresh runs">
                <RefreshCwIcon />
              </Button>
            </div>
          </div>
          {#if loadingRuns && runs.length === 0}
            <div class="empty-row">Loading runs...</div>
          {:else if runs.length === 0}
            <div class="empty-row">No recorded runs</div>
          {:else}
            <div class="runs-list">
              {#each runs as run}
                <div class="run-row">
                  <div class="run-meta">
                    <strong>{run.status || "run"}</strong>
                    <span>{formatRunTime(run.started_at_s)} / {formatDuration(run.duration_ms)}</span>
                  </div>
                  {#if run.output}
                    <pre>{run.output}</pre>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <details class="raw-json">
          <summary>Raw job JSON</summary>
          <pre>{JSON.stringify(selectedJob, null, 2)}</pre>
        </details>
      {:else}
        <div class="empty-detail">Select a cron job or create a new one.</div>
      {/if}
    </Card>
  </div>
</section>

<style>
  .cron-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .panel-header,
  .detail-header,
  .section-title {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .panel-header h2,
  .section-title h3,
  .detail-header h3 {
    margin: 0;
    color: var(--shadcn-foreground);
    font-weight: 600;
  }

  .panel-header h2 {
    font-size: 1.1rem;
  }

  .section-title h3,
  .detail-header h3 {
    font-size: 1rem;
  }

  .panel-header p,
  .muted {
    margin: 0.35rem 0 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.85rem;
  }

  .header-actions,
  .action-row,
  .form-actions,
  .inline-actions,
  .preset-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .inline-actions :global(> div) {
    width: 5rem;
  }

  .summary-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  :global(.summary-item) {
    gap: 0.25rem;
  }

  :global(.summary-item) span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  :global(.summary-item) strong {
    font-size: 1.3rem;
    color: var(--shadcn-foreground);
  }

  .banner {
    padding: 0.75rem 1rem;
    border-radius: var(--shadcn-radius);
    font-size: 0.9rem;
    border: 1px solid var(--shadcn-border);
  }

  .error-banner {
    color: var(--shadcn-destructive);
    border-color: color-mix(in srgb, var(--shadcn-destructive) 35%, var(--shadcn-border));
    background: color-mix(in srgb, var(--shadcn-destructive) 6%, var(--shadcn-card));
  }

  .success-banner {
    color: #166534;
    border-color: color-mix(in srgb, #16a34a 35%, var(--shadcn-border));
    background: color-mix(in srgb, #16a34a 6%, var(--shadcn-card));
  }

  .cron-workspace {
    display: grid;
    grid-template-columns: minmax(320px, 0.9fr) minmax(420px, 1.4fr);
    gap: 1rem;
    align-items: start;
  }

  :global(.jobs-pane),
  :global(.detail-pane) {
    min-width: 0;
  }

  :global(.detail-pane) {
    gap: 1rem;
  }

  .toolbar,
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .checkbox-field {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.35rem;
    color: var(--shadcn-foreground);
    font-size: 0.85rem;
  }

  .checkbox-field input {
    width: auto;
  }

  :global(.mono-input) {
    font-family: var(--prin7r-font-mono-standard);
    line-height: 1.4;
  }

  .job-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .job-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.6rem 0.75rem;
    width: 100%;
    text-align: left;
    padding: 0.75rem;
    background: var(--shadcn-card);
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    color: var(--shadcn-foreground);
    font: inherit;
    cursor: pointer;
  }

  .job-row:hover,
  .job-row.active {
    border-color: var(--shadcn-foreground);
    background: var(--shadcn-accent);
  }

  .job-main {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .job-main strong,
  .job-preview {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .job-main span,
  .job-preview {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8rem;
  }

  .job-preview {
    grid-column: 1 / -1;
  }

  .empty-row,
  .empty-detail {
    padding: 1rem;
    color: var(--shadcn-muted-foreground);
    border: 1px dashed var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    text-align: center;
  }

  .runs-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .edit-panel,
  .runs-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .run-row {
    padding: 0.75rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
  }

  .run-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.82rem;
  }

  .run-meta strong {
    color: var(--shadcn-foreground);
  }

  .mono {
    font-family: var(--prin7r-font-mono-standard);
  }

  pre {
    margin: 0.75rem 0 0;
    padding: 0.75rem;
    overflow: auto;
    color: var(--shadcn-foreground);
    background: var(--shadcn-muted);
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.78rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .raw-json summary {
    cursor: pointer;
    color: var(--shadcn-muted-foreground);
  }

  @media (max-width: 980px) {
    .cron-workspace,
    .summary-strip,
    .toolbar,
    .form-grid {
      grid-template-columns: 1fr;
    }

    .panel-header,
    .detail-header,
    .section-title {
      flex-direction: column;
    }
  }
</style>
