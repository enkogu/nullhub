<script lang="ts">
  import { api } from "$lib/api/client";
  import {
    describeInstanceCliError,
    isInstanceCliError,
  } from "$lib/instanceCli";
  import { Card } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Select } from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
  import { Badge } from "$lib/components/ui/badge";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import SearchIcon from "@lucide/svelte/icons/search";

  type MemoryStats = {
    backend?: string;
    retrieval?: string;
    vector?: string;
    embedding?: string;
    rollout?: string;
    sync?: string;
    fallback?: string;
    sources?: number;
    entries?: number;
    vector_entries?: number | null;
    outbox_pending?: number | null;
  };

  type MemoryEntry = {
    key: string;
    category: string;
    timestamp: string;
    content: string;
    session_id?: string | null;
  };

  type MemorySearchResult = {
    key: string;
    category: string;
    snippet: string;
    source: string;
    source_path: string;
    final_score: number;
    start_line: number;
    end_line: number;
    created_at: number;
    keyword_rank?: number | null;
    vector_score?: number | null;
  };

  let { component, name, active = false } = $props<{
    component: string;
    name: string;
    active?: boolean;
  }>();

  let stats = $state<MemoryStats | null>(null);
  let statsLoading = $state(false);
  let statsError = $state<string | null>(null);
  let loadedStatsKey = $state("");

  let entries = $state<MemoryEntry[]>([]);
  let entriesLoading = $state(false);
  let entriesError = $state<string | null>(null);
  let category = $state("conversation");
  let limit = $state("50");
  let loadedEntriesKey = $state("");

  let searchQuery = $state("");
  let searchResults = $state<MemorySearchResult[]>([]);
  let searchLoading = $state(false);
  let searchError = $state<string | null>(null);
  let searchSubmittedQuery = $state("");
  let searchContextKey = $state("");

  const instanceKey = $derived(`${component}/${name}`);
  let statsRequestSeq = 0;
  let entriesRequestSeq = 0;
  let searchRequestSeq = 0;

  function formatSearchTimestamp(epochSeconds: number): string {
    if (!epochSeconds) return "-";
    const date = new Date(epochSeconds * 1000);
    return Number.isNaN(date.getTime()) ? String(epochSeconds) : date.toLocaleString();
  }

  function parsedLimit(): number {
    return Math.max(1, Number(limit || 50) || 50);
  }

  async function loadStats(force = false) {
    if (!active || !component || !name) return;
    const contextKey = instanceKey;
    const nextKey = `${instanceKey}:stats`;
    if (!force && loadedStatsKey === nextKey) return;

    const req = ++statsRequestSeq;
    statsLoading = true;
    statsError = null;
    try {
      const result = await api.getMemory(component, name, { stats: true });
      if (req !== statsRequestSeq || contextKey !== instanceKey || !active) return;
      if (isInstanceCliError(result)) {
        stats = null;
        statsError = describeInstanceCliError(result, "Memory stats are unavailable.");
      } else {
        stats = result || null;
        statsError = null;
      }
      loadedStatsKey = nextKey;
    } catch (error) {
      if (req !== statsRequestSeq || contextKey !== instanceKey || !active) return;
      stats = null;
      statsError = (error as Error).message || "Failed to load memory stats.";
    } finally {
      if (req === statsRequestSeq && contextKey === instanceKey) {
        statsLoading = false;
      }
    }
  }

  async function loadEntries(force = false) {
    if (!active || !component || !name) return;
    const contextKey = instanceKey;
    const nextKey = `${instanceKey}:${category}:${limit}`;
    if (!force && loadedEntriesKey === nextKey) return;

    const req = ++entriesRequestSeq;
    entriesLoading = true;
    entriesError = null;
    try {
      const result = await api.getMemory(component, name, {
        category: category === "all" ? undefined : category,
        limit: parsedLimit(),
      });
      if (req !== entriesRequestSeq || contextKey !== instanceKey || !active) return;
      if (isInstanceCliError(result)) {
        entries = [];
        entriesError = describeInstanceCliError(result, "Memory entries are unavailable.");
      } else {
        entries = Array.isArray(result) ? result : [];
        entriesError = null;
      }
      loadedEntriesKey = nextKey;
    } catch (error) {
      if (req !== entriesRequestSeq || contextKey !== instanceKey || !active) return;
      entries = [];
      entriesError = (error as Error).message || "Failed to load memory entries.";
    } finally {
      if (req === entriesRequestSeq && contextKey === instanceKey) {
        entriesLoading = false;
      }
    }
  }

  async function runSearch() {
    if (!active || !searchQuery.trim()) return;
    const contextKey = instanceKey;
    const req = ++searchRequestSeq;
    searchLoading = true;
    searchError = null;
    searchSubmittedQuery = searchQuery.trim();
    try {
      const result = await api.getMemory(component, name, {
        query: searchSubmittedQuery,
        limit: parsedLimit(),
      });
      if (req !== searchRequestSeq || contextKey !== instanceKey || !active) return;
      if (isInstanceCliError(result)) {
        searchResults = [];
        searchError = describeInstanceCliError(result, "Memory search is unavailable.");
      } else {
        searchResults = Array.isArray(result) ? result : [];
        searchError = null;
      }
    } catch (error) {
      if (req !== searchRequestSeq || contextKey !== instanceKey || !active) return;
      searchResults = [];
      searchError = (error as Error).message || "Failed to search memory.";
    } finally {
      if (req === searchRequestSeq && contextKey === instanceKey) {
        searchLoading = false;
      }
    }
  }

  function refreshMemory() {
    loadedStatsKey = "";
    loadedEntriesKey = "";
    void loadStats(true);
    void loadEntries(true);
  }

  $effect(() => {
    if (!active || !component || !name) return;
    if (searchContextKey !== instanceKey) {
      searchContextKey = instanceKey;
      searchQuery = "";
      searchResults = [];
      searchLoading = false;
      searchError = null;
      searchSubmittedQuery = "";
    }
    if (loadedStatsKey !== `${instanceKey}:stats`) {
      stats = null;
      statsError = null;
      void loadStats(true);
    }
  });

  $effect(() => {
    if (!active || !component || !name) return;
    const key = `${instanceKey}:${category}:${limit}`;
    if (loadedEntriesKey === key) return;
    entries = [];
    entriesError = null;
    void loadEntries(true);
  });
</script>

<div class="memory-panel">
  <div class="panel-toolbar">
    <div>
      <h2>Memory</h2>
      <p>Backend status, persisted entries, and semantic search results.</p>
    </div>
    <Button
      variant="outline"
      size="icon"
      onclick={refreshMemory}
      disabled={statsLoading || entriesLoading}
      title="Refresh"
      aria-label="Refresh memory"
    >
      <RefreshCwIcon />
    </Button>
  </div>

  <div class="stats-grid">
    {#if statsError}
      <div class="panel-state warning">{statsError}</div>
    {:else if statsLoading && !stats}
      <div class="panel-state">Loading memory stats...</div>
    {:else if stats}
      <Card class="stat-card px-5">
        <span>Backend</span>
        <strong>{stats.backend || "-"}</strong>
      </Card>
      <Card class="stat-card px-5">
        <span>Retrieval</span>
        <strong>{stats.retrieval || "-"}</strong>
      </Card>
      <Card class="stat-card px-5">
        <span>Vector</span>
        <strong>{stats.vector || "-"}</strong>
      </Card>
      <Card class="stat-card px-5">
        <span>Entries</span>
        <strong>{stats.entries ?? 0}</strong>
      </Card>
      <Card class="stat-card px-5">
        <span>Vector entries</span>
        <strong>{stats.vector_entries ?? "-"}</strong>
      </Card>
      <Card class="stat-card px-5">
        <span>Outbox pending</span>
        <strong>{stats.outbox_pending ?? "-"}</strong>
      </Card>
    {/if}
  </div>

  <Card class="memory-section px-5">
    <div class="section-header">
      <h3>Stored entries</h3>
      <div class="controls">
        <div class="control-field">
          <Label for="memory-category">Category</Label>
          <Select id="memory-category" bind:value={category}>
            <option value="all">All</option>
            <option value="core">Core</option>
            <option value="daily">Daily</option>
            <option value="conversation">Conversation</option>
          </Select>
        </div>
        <div class="control-field">
          <Label for="memory-limit">Limit</Label>
          <Select id="memory-limit" bind:value={limit}>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </Select>
        </div>
      </div>
    </div>

    {#if entriesError}
      <div class="panel-state warning">{entriesError}</div>
    {:else if entriesLoading && entries.length === 0}
      <div class="panel-state">Loading memory entries...</div>
    {:else if entries.length === 0}
      <div class="panel-state">No memory entries for this filter.</div>
    {:else}
      <div class="entry-list">
        {#each entries as entry}
          <article class="entry-card">
            <header>
              <div>
                <div class="entry-key">{entry.key}</div>
                <div class="entry-meta">
                  <span>{entry.category}</span>
                  <span>{entry.timestamp || "-"}</span>
                  {#if entry.session_id}
                    <span class="mono">{entry.session_id}</span>
                  {/if}
                </div>
              </div>
            </header>
            <pre>{entry.content}</pre>
          </article>
        {/each}
      </div>
    {/if}
  </Card>

  <Card class="memory-section px-5">
    <div class="section-header">
      <h3>Search</h3>
      <form
        class="search-form"
        onsubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <Input bind:value={searchQuery} placeholder="Find facts, snippets, or memory keys" />
        <Button type="submit" size="icon" disabled={searchLoading || !searchQuery.trim()} title="Search" aria-label="Search memory">
          <SearchIcon />
        </Button>
      </form>
    </div>

    {#if searchError}
      <div class="panel-state warning">{searchError}</div>
    {:else if searchLoading}
      <div class="panel-state">Searching memory...</div>
    {:else if searchSubmittedQuery && searchResults.length === 0}
      <div class="panel-state">No results for "{searchSubmittedQuery}".</div>
    {:else if searchResults.length > 0}
      <div class="search-list">
        {#each searchResults as result}
          <article class="search-card">
            <header>
              <div>
                <div class="entry-key">{result.key}</div>
                <div class="entry-meta">
                  <span>{result.category}</span>
                  <span>{result.source}</span>
                  <span>{result.final_score?.toFixed?.(3) ?? result.final_score}</span>
                </div>
              </div>
              <div class="search-meta">
                <span>{formatSearchTimestamp(result.created_at)}</span>
                <span>{result.start_line}-{result.end_line}</span>
              </div>
            </header>
            <div class="search-path mono">{result.source_path}</div>
            <pre>{result.snippet}</pre>
          </article>
        {/each}
      </div>
    {:else}
      <div class="panel-state">Search memory when you need a specific fact or snippet.</div>
    {/if}
  </Card>
</div>

<style>
  .memory-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .panel-toolbar,
  .section-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }
  .panel-toolbar h2,
  .section-header h3 {
    margin: 0;
    color: var(--shadcn-foreground);
    font-weight: 600;
  }
  .panel-toolbar h2 {
    font-size: 1.1rem;
  }
  .section-header h3 {
    font-size: 1rem;
  }
  .panel-toolbar p {
    margin: 0.25rem 0 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }
  .panel-state {
    padding: 1.5rem;
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
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }
  :global(.stat-card) {
    gap: 0.35rem;
  }
  :global(.stat-card) span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }
  :global(.stat-card) strong {
    font-size: 0.95rem;
    color: var(--shadcn-foreground);
  }
  :global(.memory-section) {
    gap: 0.9rem;
  }
  .controls,
  .search-form {
    display: flex;
    gap: 0.75rem;
    align-items: end;
  }
  .control-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 120px;
  }
  .search-form {
    flex: 1;
    align-items: center;
  }
  .search-form :global(input) {
    flex: 1;
  }
  .entry-list,
  .search-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .entry-card,
  .search-card {
    padding: 0.95rem 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
  }
  .entry-card header,
  .search-card header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.65rem;
  }
  .entry-key {
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.82rem;
    color: var(--shadcn-foreground);
    word-break: break-all;
  }
  .entry-meta,
  .search-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    margin-top: 0.3rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }
  .search-path {
    margin-bottom: 0.65rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.74rem;
    word-break: break-all;
  }
  .mono {
    font-family: var(--prin7r-font-mono-standard);
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--shadcn-foreground);
  }

  @media (max-width: 900px) {
    .panel-toolbar,
    .section-header,
    .search-form {
      flex-direction: column;
      align-items: stretch;
    }
    .controls {
      flex-wrap: wrap;
      align-items: stretch;
    }
  }
</style>
