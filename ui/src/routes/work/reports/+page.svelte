<script lang="ts">
  import { api, type ReportOption } from "$lib/api/client";
  import { onMount } from "svelte";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Card } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Select } from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
  import { Badge } from "$lib/components/ui/badge";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import CheckIcon from "@lucide/svelte/icons/check";

  type Step = "form" | "preview" | "result";

  let step = $state<Step>("form");
  let repoOptions = $state<ReportOption[]>([]);
  let typeOptions = $state<ReportOption[]>([]);
  let repo = $state("");
  let type = $state("");
  let message = $state("");
  let loading = $state(false);
  let metaLoading = $state(true);
  let error = $state("");

  // Preview state
  let previewTitle = $state("");
  let previewMarkdown = $state("");
  let previewLabels = $state<string[]>([]);
  let previewRepo = $state("");

  // Result state
  let resultUrl = $state("");
  let resultTitle = $state("");
  let resultLabels = $state<string[]>([]);
  let resultRepo = $state("");
  let resultManualUrl = $state("");
  let resultError = $state("");
  let resultHint = $state("");
  let resultMarkdown = $state("");
  let copied = $state(false);

  onMount(() => {
    void loadMeta();
  });

  async function loadMeta() {
    metaLoading = true;
    error = "";
    try {
      const meta = await api.getReportMeta();
      repoOptions = meta.repos.map(({ value, label }) => ({ value, label }));
      typeOptions = meta.types.map(({ value, label }) => ({ value, label }));

      if (!repoOptions.some((option) => option.value === repo)) {
        repo = repoOptions[0]?.value || "";
      }
      if (!typeOptions.some((option) => option.value === type)) {
        type = typeOptions[0]?.value || "";
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      metaLoading = false;
    }
  }

  async function goToPreview() {
    if (!repo || !type) {
      error = metaLoading ? "Loading report metadata..." : "Report metadata is unavailable";
      return;
    }
    if (!message.trim()) {
      error = "Summary is required";
      return;
    }
    loading = true;
    error = "";
    try {
      const res = await api.reportPreview({ repo, type, message: message.trim() });
      previewTitle = res.title;
      previewMarkdown = res.markdown;
      previewLabels = res.labels;
      previewRepo = res.repo;
      step = "preview";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function submit() {
    loading = true;
    error = "";
    try {
      const res = await api.submitReport({
        repo,
        type,
        message: message.trim(),
        markdown: previewMarkdown,
      });
      if (res.status === "created" && res.url) {
        resultUrl = res.url;
        resultTitle = previewTitle;
        resultLabels = [...previewLabels];
        resultRepo = previewRepo;
        resultManualUrl = "";
        resultError = "";
        resultHint = "";
        resultMarkdown = "";
      } else {
        resultUrl = "";
        resultTitle = res.title || previewTitle;
        resultLabels = res.labels || [...previewLabels];
        resultRepo = res.repo || previewRepo;
        resultManualUrl = res.manual_url || "";
        resultError = res.error || "Automatic submission failed.";
        resultHint = res.hint || "";
        resultMarkdown = res.markdown || previewMarkdown;
      }
      step = "result";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function reset() {
    step = "form";
    message = "";
    error = "";
    resultUrl = "";
    resultTitle = "";
    resultLabels = [];
    resultRepo = "";
    resultManualUrl = "";
    resultError = "";
    resultHint = "";
    resultMarkdown = "";
    copied = false;
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(resultMarkdown);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = resultMarkdown;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        copied = true;
        setTimeout(() => (copied = false), 2000);
      } catch {
        error = "Copy failed. Please select and copy the text manually.";
      }
    }
  }
</script>

<div class="report-page">
  <PageHeader title="Report Issue" subtitle="File a bug or feature request as a GitHub issue." />

  {#if step === "form"}
    <Card class="px-5">
      <div class="fields">
        <div class="field">
          <Label for="report-repo">Repository</Label>
          <Select id="report-repo" bind:value={repo} disabled={metaLoading || repoOptions.length === 0}>
            {#each repoOptions as r}
              <option value={r.value}>{r.label}</option>
            {/each}
          </Select>
        </div>

        <div class="field">
          <Label for="report-type">Report type</Label>
          <Select id="report-type" bind:value={type} disabled={metaLoading || typeOptions.length === 0}>
            {#each typeOptions as t}
              <option value={t.value}>{t.label}</option>
            {/each}
          </Select>
        </div>

        <div class="field">
          <Label for="report-message">Summary</Label>
          <Textarea
            id="report-message"
            bind:value={message}
            rows={4}
            placeholder="One-line summary of the bug or feature. You'll be able to fill repro steps, impact, and the rest in the preview."
          />
        </div>

        {#if error}
          <div class="banner banner-error">{error}</div>
        {/if}
      </div>

      <div class="actions">
        <Button onclick={goToPreview} disabled={loading || metaLoading || !repo || !type}>
          {metaLoading ? "Loading..." : loading ? "Loading..." : "Next"}
        </Button>
      </div>
    </Card>

  {:else if step === "preview"}
    <Card class="px-5">
      <div class="meta-list">
        <div class="meta-row">
          <span class="meta-label">Title</span>
          <code>{previewTitle}</code>
        </div>
        <div class="meta-row">
          <span class="meta-label">Labels</span>
          <span class="label-list">
            {#each previewLabels as label}
              <Badge variant="outline">{label}</Badge>
            {/each}
          </span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Repository</span>
          <code>{previewRepo}</code>
        </div>
      </div>

      <div class="field">
        <Label for="report-preview">Issue body</Label>
        <Textarea id="report-preview" bind:value={previewMarkdown} rows={16} class="mono" />
      </div>

      <p class="hint">
        Fill in the placeholders before submitting. The preview is the exact issue body that will be sent to GitHub.
      </p>

      {#if error}
        <div class="banner banner-error">{error}</div>
      {/if}

      <div class="actions actions-split">
        <Button variant="outline" onclick={() => (step = "form")}>Back</Button>
        <Button onclick={submit} disabled={loading}>
          {loading ? "Submitting..." : "Submit"}
        </Button>
      </div>
    </Card>

  {:else if step === "result"}
    <Card class="px-5">
      {#if resultUrl}
        <div class="banner banner-success">Issue created successfully.</div>
        <div class="result-link">
          <a href={resultUrl} target="_blank" rel="noopener noreferrer">{resultUrl}</a>
        </div>
      {:else}
        <div class="banner banner-error">Could not submit automatically.</div>
        {#if resultError}
          <p class="hint"><strong>Error:</strong> {resultError}</p>
        {/if}
        {#if resultHint}
          <p class="hint">{resultHint}</p>
        {/if}
        <div class="meta-list">
          <div class="meta-row">
            <span class="meta-label">Repository</span>
            <code>{resultRepo}</code>
          </div>
          <div class="meta-row">
            <span class="meta-label">Title</span>
            <code>{resultTitle}</code>
          </div>
          <div class="meta-row">
            <span class="meta-label">Labels</span>
            <span class="label-list">
              {#each resultLabels as label}
                <Badge variant="outline">{label}</Badge>
              {/each}
            </span>
          </div>
          {#if resultManualUrl}
            <div class="result-link">
              <a href={resultManualUrl} target="_blank" rel="noopener noreferrer">Open prefilled GitHub issue</a>
            </div>
          {/if}
        </div>
        <div class="fallback-block">
          <div class="fallback-header">
            <span>Copy this content and create the issue manually:</span>
            <Button
              variant="outline"
              size="icon-sm"
              onclick={copyMarkdown}
              title={copied ? "Copied" : "Copy markdown"}
              aria-label={copied ? "Copied" : "Copy markdown"}
            >
              {#if copied}<CheckIcon size={15} />{:else}<CopyIcon size={15} />{/if}
            </Button>
          </div>
          <pre>{resultMarkdown}</pre>
        </div>
      {/if}

      <div class="actions">
        <Button variant="outline" onclick={reset}>New report</Button>
      </div>
    </Card>
  {/if}
</div>

<style>
  .report-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field :global(textarea.mono) {
    font-family: var(--prin7r-font-mono-standard);
    line-height: 1.5;
  }

  .meta-list {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .meta-label {
    min-width: 6rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--shadcn-muted-foreground);
  }

  .meta-row code {
    font-size: 0.875rem;
    color: var(--shadcn-foreground);
    word-break: break-all;
  }

  .label-list {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .actions-split {
    justify-content: space-between;
  }

  .hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--shadcn-muted-foreground);
    line-height: 1.5;
  }

  .result-link a {
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    word-break: break-all;
  }

  .fallback-block {
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    overflow: hidden;
  }

  .fallback-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.625rem 0.875rem;
    background: var(--shadcn-muted);
    border-bottom: 1px solid var(--shadcn-border);
    font-size: 0.8125rem;
    color: var(--shadcn-muted-foreground);
  }

  .fallback-block pre {
    padding: 1rem;
    margin: 0;
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.8125rem;
    color: var(--shadcn-foreground);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
    max-height: 400px;
    overflow-y: auto;
  }

  .banner {
    padding: 0.75rem 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
    font-size: 0.875rem;
    color: var(--shadcn-foreground);
  }

  .banner-success {
    border-color: color-mix(in srgb, #16a34a 40%, transparent);
    color: #15803d;
    background: color-mix(in srgb, #16a34a 8%, transparent);
  }

  .banner-error {
    border-color: var(--shadcn-destructive);
    color: var(--shadcn-destructive);
    background: color-mix(in srgb, var(--shadcn-destructive) 8%, transparent);
  }

  @media (max-width: 640px) {
    .report-page {
      padding: 1.25rem;
    }

    .meta-row,
    .fallback-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .actions-split {
      flex-direction: column;
      align-items: stretch;
      gap: 0.5rem;
    }
  }
</style>
