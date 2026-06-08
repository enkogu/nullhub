<script lang="ts">
  import { api, type CronJobCreateRequest, type CronJobUpdateRequest } from "$lib/api/client";

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
      <button class="btn subtle" onclick={() => loadJobs(true)} disabled={loadingJobs}>Refresh</button>
      <button class="btn" onclick={() => { createScheduleMode = "recurring"; showCreate = true; }}>New Job</button>
      <button class="btn" onclick={() => { createScheduleMode = "once"; showCreate = true; }}>One-Shot</button>
    </div>
  </div>

  <div class="summary-strip">
    <div><span>Total</span><strong>{totalJobs}</strong></div>
    <div><span>Active</span><strong>{activeJobs}</strong></div>
    <div><span>Paused</span><strong>{pausedJobs}</strong></div>
    <div><span>One-Shot</span><strong>{oneShotJobs}</strong></div>
  </div>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}
  {#if actionError}
    <div class="error-banner">{actionError}</div>
  {/if}
  {#if message}
    <div class="success-banner">{message}</div>
  {/if}

  {#if showCreate}
    <div class="create-panel">
      <div class="section-title">
        <h3>{createScheduleMode === "once" ? "Create One-Shot Job" : "Create Recurring Job"}</h3>
        <button class="link-btn" onclick={() => (showCreate = false)}>Close</button>
      </div>

      <div class="form-grid">
        <label>
          <span>Schedule</span>
          <select name="cron-create-schedule-mode" bind:value={createScheduleMode}>
            <option value="recurring">Recurring</option>
            <option value="once">One-shot</option>
          </select>
        </label>
        <label>
          <span>Payload</span>
          <select name="cron-create-payload-mode" bind:value={createPayloadMode}>
            <option value="shell">Shell command</option>
            <option value="agent">Agent prompt</option>
          </select>
        </label>
      </div>

      {#if createScheduleMode === "recurring"}
        <label class="field">
          <span>Cron Expression</span>
          <input name="cron-create-expression" bind:value={createExpression} placeholder="*/10 * * * *" />
        </label>
        <div class="preset-row">
          <button class="chip" onclick={() => applyPreset("*/5 * * * *")}>Every 5m</button>
          <button class="chip" onclick={() => applyPreset("0 * * * *")}>Hourly</button>
          <button class="chip" onclick={() => applyPreset("0 9 * * *")}>Daily</button>
          <button class="chip" onclick={() => applyPreset("0 9 * * 1")}>Weekly</button>
        </div>
      {:else}
        <label class="field">
          <span>Delay</span>
          <input name="cron-create-delay" bind:value={createDelay} placeholder="5m, 1h, 24h" />
        </label>
      {/if}

      {#if createPayloadMode === "shell"}
        <label class="field">
          <span>Command</span>
          <textarea name="cron-create-command" bind:value={createCommand} rows="4" placeholder="echo heartbeat"></textarea>
        </label>
      {:else}
        <label class="field">
          <span>Prompt</span>
          <textarea name="cron-create-prompt" bind:value={createPrompt} rows="5" placeholder="Summarize recent activity"></textarea>
        </label>
        <div class="form-grid">
          <label>
            <span>Model</span>
            <input name="cron-create-model" bind:value={createModel} placeholder="optional" />
          </label>
          <label>
            <span>Session Target</span>
            <input name="cron-create-session-target" bind:value={createSessionTarget} placeholder="optional" />
          </label>
          <label class="checkbox-field">
            <input name="cron-create-announce" type="checkbox" bind:checked={createAnnounce} />
            <span>Announce result</span>
          </label>
          <label>
            <span>Delivery Channel</span>
            <input name="cron-create-delivery-channel" bind:value={createDeliveryChannel} placeholder="telegram" />
          </label>
          <label>
            <span>Delivery Account</span>
            <input name="cron-create-delivery-account" bind:value={createDeliveryAccountId} placeholder="optional" />
          </label>
          <label>
            <span>Recipient</span>
            <input name="cron-create-delivery-to" bind:value={createDeliveryTo} placeholder="optional" />
          </label>
        </div>
      {/if}

      <div class="form-actions">
        <button class="btn" onclick={createJob} disabled={actionLoading === "create"}>
          {actionLoading === "create" ? "Creating..." : "Create"}
        </button>
      </div>
    </div>
  {/if}

  <div class="cron-workspace">
    <div class="jobs-pane">
      <div class="toolbar">
        <input name="cron-search" bind:value={search} placeholder="Search jobs" />
        <select name="cron-filter" bind:value={filter}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="recurring">Recurring</option>
          <option value="one-shot">One-shot</option>
          <option value="shell">Shell</option>
          <option value="agent">Agent</option>
        </select>
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
              <span class={`status-pill ${jobStatus(job)}`}>{jobStatus(job)}</span>
              <span class="job-main">
                <strong>{jobId(job)}</strong>
                <span>{scheduleText(job)} / {jobType(job)}</span>
              </span>
              <span class="job-preview">{payloadPreview(job)}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>

    <div class="detail-pane">
      {#if selectedJob}
        <div class="detail-header">
          <div>
            <h3>{jobId(selectedJob)}</h3>
            <span class={`status-pill ${jobStatus(selectedJob)}`}>{jobStatus(selectedJob)}</span>
          </div>
          {#if loadingDetail}<span class="muted">Loading detail...</span>{/if}
        </div>

        <div class="action-row">
          <button class="btn" onclick={() => runAction("run")} disabled={actionLoading !== null}>Run Now</button>
          {#if isDisabled(selectedJob)}
            <button class="btn" onclick={() => runAction("enable")} disabled={actionLoading !== null}>Enable</button>
          {:else if isPaused(selectedJob)}
            <button class="btn" onclick={() => runAction("resume")} disabled={actionLoading !== null}>Resume</button>
          {:else}
            <button class="btn" onclick={() => runAction("pause")} disabled={actionLoading !== null}>Pause</button>
          {/if}
          <button class="btn danger" onclick={deleteJob} disabled={actionLoading !== null}>Delete</button>
        </div>

        <div class="edit-panel">
          <div class="section-title">
            <h3>Edit Job</h3>
            <button class="link-btn" onclick={() => syncEditDraft(selectedJob)}>Reset</button>
          </div>
          <div class="form-grid">
            <label>
              <span>Expression</span>
              <input name="cron-edit-expression" bind:value={editExpression} disabled={isOneShot(selectedJob)} />
            </label>
            <label>
              <span>Payload</span>
              <select name="cron-edit-payload-mode" bind:value={editPayloadMode} disabled>
                <option value="shell">Shell command</option>
                <option value="agent">Agent prompt</option>
              </select>
            </label>
            <label class="checkbox-field">
              <input name="cron-edit-enabled" type="checkbox" bind:checked={editEnabled} />
              <span>Enabled</span>
            </label>
          </div>
          {#if isOneShot(selectedJob)}
            <p class="muted">One-shot schedule is read-only in the current backend API.</p>
          {/if}
          {#if editPayloadMode === "shell"}
            <label class="field">
              <span>Command</span>
              <textarea name="cron-edit-command" bind:value={editCommand} rows="4"></textarea>
            </label>
          {:else}
            <label class="field">
              <span>Prompt</span>
              <textarea name="cron-edit-prompt" bind:value={editPrompt} rows="5"></textarea>
            </label>
            <div class="form-grid">
              <label>
                <span>Model</span>
                <input name="cron-edit-model" bind:value={editModel} />
              </label>
              <label>
                <span>Session Target</span>
                <input name="cron-edit-session-target" bind:value={editSessionTarget} />
              </label>
            </div>
          {/if}
          <div class="form-actions">
            <button class="btn" onclick={updateJob} disabled={actionLoading === "update"}>
              {actionLoading === "update" ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        <div class="runs-panel">
          <div class="section-title">
            <h3>Run History</h3>
            <div class="inline-actions">
              <select name="cron-run-limit" bind:value={runLimit} onchange={() => loadRuns(true)}>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
              <button class="btn subtle" onclick={() => loadRuns(true)} disabled={loadingRuns}>Refresh</button>
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
    </div>
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
    color: var(--fg);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .panel-header p,
  .muted {
    margin: 0.35rem 0 0;
    color: var(--fg-dim);
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

  .summary-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .summary-strip div,
  .create-panel,
  .jobs-pane,
  .detail-pane,
  .edit-panel,
  .runs-panel,
  .raw-json {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .summary-strip div {
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .summary-strip span {
    color: var(--fg-dim);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .summary-strip strong {
    font-size: 1.3rem;
    color: var(--accent);
  }

  .error-banner,
  .success-banner {
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    font-size: 0.9rem;
  }

  .error-banner {
    color: var(--error);
    border: 1px solid var(--error);
    background: rgba(255, 0, 0, 0.08);
  }

  .success-banner {
    color: var(--success);
    border: 1px solid var(--success);
    background: rgba(0, 255, 150, 0.08);
  }

  .create-panel,
  .edit-panel,
  .runs-panel {
    padding: 1rem;
  }

  .cron-workspace {
    display: grid;
    grid-template-columns: minmax(320px, 0.9fr) minmax(420px, 1.4fr);
    gap: 1rem;
    align-items: start;
  }

  .jobs-pane,
  .detail-pane {
    min-width: 0;
    padding: 1rem;
  }

  .detail-pane {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .toolbar,
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  label,
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    color: var(--fg-dim);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .checkbox-field {
    flex-direction: row;
    align-items: center;
    min-height: 2.35rem;
    text-transform: none;
    letter-spacing: 0;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.65rem 0.75rem;
    font: inherit;
  }

  textarea {
    resize: vertical;
    font-family: var(--font-mono);
    line-height: 1.4;
  }

  input:disabled {
    color: var(--fg-dim);
    opacity: 0.7;
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
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--fg);
    cursor: pointer;
  }

  .job-row:hover,
  .job-row.active {
    border-color: var(--accent);
    background: var(--bg-hover);
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
    color: var(--fg-dim);
    font-size: 0.8rem;
  }

  .job-preview {
    grid-column: 1 / -1;
    font-family: var(--font-mono);
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: fit-content;
    min-width: 4.5rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--fg-dim);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .status-pill.active,
  .status-pill.one-shot {
    color: var(--success);
    border-color: var(--success);
  }

  .status-pill.paused,
  .status-pill.disabled {
    color: var(--warning);
    border-color: var(--warning);
  }

  .empty-row,
  .empty-detail {
    padding: 1rem;
    color: var(--fg-dim);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .btn,
  .chip,
  .link-btn {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-surface);
    color: var(--fg);
    padding: 0.55rem 0.8rem;
    font: inherit;
    cursor: pointer;
  }

  .btn:hover,
  .chip:hover,
  .link-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .btn.danger {
    color: var(--error);
    border-color: var(--error);
  }

  .btn.subtle,
  .link-btn,
  .chip {
    color: var(--fg-dim);
  }

  .runs-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .run-row {
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
  }

  .run-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    color: var(--fg-dim);
    font-size: 0.82rem;
  }

  .run-meta strong {
    color: var(--fg);
    text-transform: uppercase;
  }

  pre {
    margin: 0.75rem 0 0;
    padding: 0.75rem;
    overflow: auto;
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 0.78rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .raw-json {
    padding: 0.75rem 1rem;
  }

  .raw-json summary {
    cursor: pointer;
    color: var(--fg-dim);
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
