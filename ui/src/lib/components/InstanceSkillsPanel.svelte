<script lang="ts">
  import { api } from "$lib/api/client";
  import {
    describeInstanceCliError,
    isInstanceCliError,
  } from "$lib/instanceCli";
  import { Card } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Badge } from "$lib/components/ui/badge";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";

  type Skill = {
    name: string;
    version: string;
    description: string;
    author: string;
    enabled: boolean;
    always: boolean;
    available: boolean;
    missing_deps: string;
    path: string;
    source: string;
    instructions_bytes: number;
  };

  type CatalogEntry = {
    name: string;
    version: string;
    description: string;
    author?: string;
    recommended: boolean;
    install_kind: string;
    source?: string;
    homepage_url?: string;
    clawhub_slug?: string;
    always?: boolean;
  };

  type InstallResult = {
    status?: string;
    restart_required?: boolean;
  };

  let { component, name, active = false } = $props<{
    component: string;
    name: string;
    active?: boolean;
  }>();

  let skills = $state<Skill[]>([]);
  let catalog = $state<CatalogEntry[]>([]);
  let loading = $state(false);
  let catalogLoading = $state(false);
  let error = $state<string | null>(null);
  let catalogError = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let actionMessage = $state<string | null>(null);
  let loadedKey = $state("");
  let catalogLoadedKey = $state("");
  let requestSeq = 0;
  let catalogRequestSeq = 0;
  let busyAction = $state<string | null>(null);
  let clawhubSlug = $state("");
  let sourceInput = $state("");

  const instanceKey = $derived(`${component}/${name}`);
  const supportsInstall = $derived(component === "nullclaw");
  const installedSkillNames = $derived(new Set(skills.map((skill) => skill.name)));
  const sortedSkills = $derived(
    [...skills].sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      if (a.always !== b.always) return a.always ? -1 : 1;
      return a.name.localeCompare(b.name);
    }),
  );
  const sortedCatalog = $derived(
    [...catalog].sort((a, b) => {
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      return a.name.localeCompare(b.name);
    }),
  );

  async function loadSkills(force = false) {
    if (!active || !component || !name) return;
    const contextKey = instanceKey;
    const nextKey = `${contextKey}:skills`;
    if (!force && loadedKey === nextKey) return;

    const req = ++requestSeq;
    loading = true;
    error = null;
    try {
      const result = await api.getSkills(component, name);
      if (req !== requestSeq || contextKey !== instanceKey || !active) return;
      if (isInstanceCliError(result)) {
        skills = [];
        error = describeInstanceCliError(result, "Skills are unavailable.");
      } else {
        skills = Array.isArray(result) ? result : [];
        error = null;
      }
      loadedKey = nextKey;
    } catch (err) {
      if (req !== requestSeq || contextKey !== instanceKey || !active) return;
      skills = [];
      error = (err as Error).message || "Failed to load skills.";
    } finally {
      if (req === requestSeq && contextKey === instanceKey) {
        loading = false;
      }
    }
  }

  async function loadCatalog(force = false) {
    if (!active || !supportsInstall || !component || !name) return;
    const contextKey = instanceKey;
    const nextKey = `${contextKey}:skills:catalog`;
    if (!force && catalogLoadedKey === nextKey) return;

    const req = ++catalogRequestSeq;
    catalogLoading = true;
    catalogError = null;
    try {
      const result = await api.getSkillCatalog(component, name);
      if (req !== catalogRequestSeq || contextKey !== instanceKey || !active) return;
      catalog = Array.isArray(result) ? result : [];
      catalogLoadedKey = nextKey;
    } catch (err) {
      if (req !== catalogRequestSeq || contextKey !== instanceKey || !active) return;
      catalog = [];
      catalogError = (err as Error).message || "Failed to load recommended skills.";
    } finally {
      if (req === catalogRequestSeq && contextKey === instanceKey) {
        catalogLoading = false;
      }
    }
  }

  async function refreshAll() {
    loadedKey = "";
    catalogLoadedKey = "";
    await Promise.all([loadSkills(true), loadCatalog(true)]);
  }

  async function installBundled(entry: CatalogEntry) {
    actionError = null;
    actionMessage = null;
    busyAction = `bundled:${entry.name}`;
    try {
      const result = await api.installBundledSkill(component, name, entry.name) as InstallResult;
      if (isInstanceCliError(result)) throw new Error(describeInstanceCliError(result, `Failed to install ${entry.name}.`));
      const baseMessage = result?.status === "updated"
        ? `Updated ${entry.name}.`
        : `Installed ${entry.name}.`;
      actionMessage = result?.restart_required
        ? `${baseMessage} Restart this instance if it is already running to apply nullhub command access.`
        : baseMessage;
      await refreshAll();
    } catch (err) {
      actionError = (err as Error).message || `Failed to install ${entry.name}.`;
    } finally {
      busyAction = null;
    }
  }

  async function installFromClawhub() {
    const slug = clawhubSlug.trim();
    if (!slug) {
      actionError = "Enter a ClawHub slug first.";
      actionMessage = null;
      return;
    }
    actionError = null;
    actionMessage = null;
    busyAction = `clawhub:${slug}`;
    try {
      const result = await api.installSkillFromClawhub(component, name, slug);
      if (isInstanceCliError(result)) throw new Error(describeInstanceCliError(result, `Failed to install ${slug} from ClawHub.`));
      clawhubSlug = "";
      actionMessage = `Installed ${slug} from ClawHub.`;
      await refreshAll();
    } catch (err) {
      actionError = (err as Error).message || `Failed to install ${slug} from ClawHub.`;
    } finally {
      busyAction = null;
    }
  }

  async function installFromSource() {
    const source = sourceInput.trim();
    if (!source) {
      actionError = "Enter a git URL or local path first.";
      actionMessage = null;
      return;
    }
    actionError = null;
    actionMessage = null;
    busyAction = `source:${source}`;
    try {
      const result = await api.installSkillFromSource(component, name, source);
      if (isInstanceCliError(result)) throw new Error(describeInstanceCliError(result, "Failed to install skill from source."));
      sourceInput = "";
      actionMessage = "Installed skill from source.";
      await refreshAll();
    } catch (err) {
      actionError = (err as Error).message || "Failed to install skill from source.";
    } finally {
      busyAction = null;
    }
  }

  async function removeSkill(skillName: string) {
    actionError = null;
    actionMessage = null;
    busyAction = `remove:${skillName}`;
    try {
      const result = await api.removeSkill(component, name, skillName);
      if (isInstanceCliError(result)) throw new Error(describeInstanceCliError(result, `Failed to remove ${skillName}.`));
      actionMessage = `Removed ${skillName}.`;
      await refreshAll();
    } catch (err) {
      actionError = (err as Error).message || `Failed to remove ${skillName}.`;
    } finally {
      busyAction = null;
    }
  }

  function installLabel(entry: CatalogEntry) {
    if (entry.install_kind === "bundled") return "Bundled";
    if (entry.install_kind === "clawhub") return "ClawHub";
    return "Source";
  }

  $effect(() => {
    if (!active || !component || !name) return;
    if (loadedKey === `${instanceKey}:skills` && (!supportsInstall || catalogLoadedKey === `${instanceKey}:skills:catalog`)) return;
    skills = [];
    catalog = [];
    error = null;
    catalogError = null;
    void refreshAll();
  });
</script>

<div class="skills-panel">
  <div class="panel-toolbar">
    <div>
      <h2>Skills</h2>
      <p>Installed prompt skills visible to this instance workspace.</p>
    </div>
    <Button
      variant="outline"
      size="icon"
      onclick={() => void refreshAll()}
      disabled={loading || catalogLoading || busyAction !== null}
      title="Refresh"
      aria-label="Refresh skills"
    >
      <RefreshCwIcon />
    </Button>
  </div>

  {#if supportsInstall}
    <Card class="skill-section px-5">
      <div class="section-header">
        <div>
          <h3>Recommended</h3>
          <p>Install managed skills that teach this nullclaw how to operate sibling tools from the Null ecosystem.</p>
        </div>
      </div>

      {#if actionMessage}
        <div class="panel-state success">{actionMessage}</div>
      {/if}
      {#if actionError}
        <div class="panel-state warning">{actionError}</div>
      {/if}
      {#if catalogError}
        <div class="panel-state warning">{catalogError}</div>
      {:else if catalogLoading && sortedCatalog.length === 0}
        <div class="panel-state">Loading recommended skills...</div>
      {:else if sortedCatalog.length > 0}
        <div class="skill-grid">
          {#each sortedCatalog as entry}
            <article class="skill-card recommended" class:installed={installedSkillNames.has(entry.name)}>
              <header>
                <div>
                  <div class="skill-name">
                    {entry.name}
                    <span class="skill-version">v{entry.version || "-"}</span>
                  </div>
                  {#if entry.description}
                    <div class="skill-description">{entry.description}</div>
                  {/if}
                </div>
                <div class="skill-badges">
                  {#if entry.recommended}
                    <Badge variant="secondary">recommended</Badge>
                  {/if}
                  {#if entry.always}
                    <Badge variant="secondary">always</Badge>
                  {/if}
                  {#if installedSkillNames.has(entry.name)}
                    <Badge variant="success">installed</Badge>
                  {/if}
                </div>
              </header>

              <div class="skill-meta">
                <div>
                  <span>Install</span>
                  <strong>{installLabel(entry)}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{entry.source || entry.clawhub_slug || "nullhub"}</strong>
                </div>
                <div>
                  <span>Homepage</span>
                  <strong>{entry.homepage_url || "-"}</strong>
                </div>
              </div>

              <div class="skill-actions">
                <Button
                  variant="default"
                  size="sm"
                  onclick={() => void installBundled(entry)}
                  disabled={busyAction !== null || entry.install_kind !== "bundled"}
                >
                  <DownloadIcon />
                  {installedSkillNames.has(entry.name) ? "Reinstall" : "Install"}
                </Button>
                {#if entry.homepage_url}
                  <Button variant="ghost" size="sm" href={entry.homepage_url} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon />
                    Browse
                  </Button>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {/if}

      <div class="install-grid">
        <form class="install-card" onsubmit={(event) => {
          event.preventDefault();
          void installFromClawhub();
        }}>
          <div>
            <h4>Install from ClawHub</h4>
            <p>Paste a published ClawHub slug. NullHub will run <code>clawhub install</code> inside this instance workspace.</p>
          </div>
          <div class="control-field">
            <Label for="clawhub-slug">ClawHub slug</Label>
            <Input
              id="clawhub-slug"
              bind:value={clawhubSlug}
              type="text"
              placeholder="my-skill"
              disabled={busyAction !== null}
            />
          </div>
          <div class="skill-actions">
            <Button variant="default" size="sm" type="submit" disabled={busyAction !== null}>
              <DownloadIcon />
              Install
            </Button>
            <Button variant="ghost" size="sm" href="https://clawhub.ai" target="_blank" rel="noreferrer">
              <ExternalLinkIcon />
              Browse ClawHub
            </Button>
          </div>
        </form>

        <form class="install-card" onsubmit={(event) => {
          event.preventDefault();
          void installFromSource();
        }}>
          <div>
            <h4>Install from source</h4>
            <p>Use a git URL or local skill path. This goes through <code>nullclaw skills install</code>.</p>
          </div>
          <div class="control-field">
            <Label for="source-input">Git URL or path</Label>
            <Input
              id="source-input"
              bind:value={sourceInput}
              type="text"
              placeholder="https://github.com/owner/repo.git"
              disabled={busyAction !== null}
            />
          </div>
          <div class="skill-actions">
            <Button variant="default" size="sm" type="submit" disabled={busyAction !== null}>
              <DownloadIcon />
              Install
            </Button>
          </div>
        </form>
      </div>
    </Card>
  {/if}

  {#if error}
    <div class="panel-state warning">{error}</div>
  {:else if loading && skills.length === 0}
    <div class="panel-state">Loading skills...</div>
  {:else if sortedSkills.length === 0}
    <div class="panel-state">No skills found for this instance.</div>
  {:else}
    <div class="skill-grid">
      {#each sortedSkills as skill}
        <article class="skill-card" class:missing={!skill.available}>
          <header>
            <div>
              <div class="skill-name">
                {skill.name}
                <span class="skill-version">v{skill.version || "-"}</span>
              </div>
              {#if skill.description}
                <div class="skill-description">{skill.description}</div>
              {/if}
            </div>
            <div class="skill-badges">
              <Badge variant={skill.available ? "success" : "warning"}>{skill.available ? "available" : "missing deps"}</Badge>
              {#if skill.always}
                <Badge variant="secondary">always</Badge>
              {/if}
              {#if skill.enabled}
                <Badge variant="outline">enabled</Badge>
              {/if}
            </div>
          </header>

          <div class="skill-meta">
            <div>
              <span>Source</span>
              <strong>{skill.source || "-"}</strong>
            </div>
            <div>
              <span>Author</span>
              <strong>{skill.author || "-"}</strong>
            </div>
            <div>
              <span>Instructions</span>
              <strong>{skill.instructions_bytes ?? 0} bytes</strong>
            </div>
          </div>

          <div class="skill-path mono">{skill.path || "-"}</div>

          {#if skill.missing_deps}
            <div class="missing-deps">Missing deps: {skill.missing_deps}</div>
          {/if}

          {#if skill.source === "workspace" && supportsInstall}
            <div class="skill-actions">
              <Button variant="destructive" size="sm" onclick={() => void removeSkill(skill.name)} disabled={busyAction !== null}>
                <Trash2Icon />
                Remove
              </Button>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .skills-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  :global(.skill-section) {
    gap: 0.9rem;
  }
  .section-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }
  .section-header h3 {
    margin: 0;
    color: var(--shadcn-foreground);
    font-size: 1rem;
    font-weight: 600;
  }
  .section-header p {
    margin: 0.25rem 0 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.84rem;
    line-height: 1.45;
  }
  .install-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 0.9rem;
  }
  .install-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
  }
  .install-card h4 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--shadcn-foreground);
  }
  .install-card p {
    margin: 0.25rem 0 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .install-card code {
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.8rem;
  }
  .control-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .panel-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }
  .panel-toolbar h2 {
    margin: 0;
    color: var(--shadcn-foreground);
    font-size: 1.1rem;
    font-weight: 600;
  }
  .panel-toolbar p {
    margin: 0.25rem 0 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }
  .panel-state {
    padding: 1rem 1.15rem;
    border: 1px dashed var(--shadcn-border);
    background: var(--shadcn-muted);
    color: var(--shadcn-muted-foreground);
    border-radius: var(--shadcn-radius);
    text-align: center;
  }
  .panel-state.warning {
    border-color: color-mix(in srgb, var(--shadcn-destructive) 35%, var(--shadcn-border));
    color: var(--shadcn-destructive);
    background: color-mix(in srgb, var(--shadcn-destructive) 6%, var(--shadcn-card));
  }
  .panel-state.success {
    border-color: color-mix(in srgb, #16a34a 35%, var(--shadcn-border));
    color: #166534;
    background: color-mix(in srgb, #16a34a 6%, var(--shadcn-card));
  }
  .skill-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 0.9rem;
  }
  .skill-card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1rem;
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
  }
  .skill-card.installed {
    border-color: color-mix(in srgb, #16a34a 28%, var(--shadcn-border));
  }
  .skill-card.missing {
    border-color: color-mix(in srgb, var(--shadcn-destructive) 25%, var(--shadcn-border));
  }
  .skill-card header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .skill-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--shadcn-foreground);
  }
  .skill-version {
    margin-left: 0.35rem;
    color: var(--shadcn-muted-foreground);
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.78rem;
  }
  .skill-description {
    margin-top: 0.35rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .skill-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: flex-end;
  }
  .skill-meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .skill-meta div {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .skill-meta span {
    font-size: 0.72rem;
    color: var(--shadcn-muted-foreground);
  }
  .skill-meta strong {
    font-size: 0.82rem;
    line-height: 1.35;
    color: var(--shadcn-foreground);
    word-break: break-word;
  }
  .skill-path,
  .missing-deps {
    font-size: 0.8rem;
    color: var(--shadcn-muted-foreground);
  }
  .skill-path {
    padding: 0.6rem 0.75rem;
    border-radius: calc(var(--shadcn-radius) - 2px);
    background: var(--shadcn-muted);
    font-family: var(--prin7r-font-mono-standard);
    overflow-wrap: anywhere;
  }
  .skill-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  @media (max-width: 720px) {
    .panel-toolbar,
    .section-header,
    .skill-card header {
      flex-direction: column;
    }
    .skill-meta {
      grid-template-columns: 1fr;
    }
  }
</style>
