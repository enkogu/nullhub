<script lang="ts">
  import BoxIcon from "@lucide/svelte/icons/box";
  import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import CircleIcon from "@lucide/svelte/icons/circle";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import FolderTreeIcon from "@lucide/svelte/icons/folder-tree";
  import KanbanIcon from "@lucide/svelte/icons/kanban";
  import LayoutGridIcon from "@lucide/svelte/icons/layout-grid";
  import LayoutListIcon from "@lucide/svelte/icons/layout-list";
  import ListIcon from "@lucide/svelte/icons/list";
  import PanelRightIcon from "@lucide/svelte/icons/panel-right";
  import SearchIcon from "@lucide/svelte/icons/search";
  import Table2Icon from "@lucide/svelte/icons/table-2";
  import TreePineIcon from "@lucide/svelte/icons/tree-pine";

  import {
    NOTION_LIKE_ENTITY_VIEWS,
    dateMs,
    fieldById,
    fieldValue,
    flattenTree,
    formatDate,
    groupRecords,
    recordSearchText,
    sortRecords,
    statusKind,
    valueText,
    visibleActions,
  } from "./adapters";
  import type {
    EntityColumn,
    EntityFieldValue,
    EntityRecord,
    EntityViewAction,
    EntityViewDefinition,
    EntityViewMode,
    UniversalEntityViewProps,
  } from "./types";

  let {
    title,
    description = "",
    records = [],
    columns = [],
    views = NOTION_LIKE_ENTITY_VIEWS,
    defaultViewId = "",
    loading = false,
    error = null,
    emptyTitle = "No records",
    emptyDescription = "Create or connect records to populate this view.",
    refreshLabel = "Refresh",
    onRefresh,
    onSelect,
    onOpen,
    actions = [],
  }: UniversalEntityViewProps = $props();

  let activeViewId = $state("");
  let query = $state("");
  let sortField = $state("");
  let sortDirection = $state<"asc" | "desc">("asc");
  let selectedId = $state("");
  let pendingActionKeys = $state<Record<string, boolean>>({});
  let monthCursor = $state(startOfMonth(new Date()));

  let activeView = $derived(views.find((view) => view.id === activeViewId) || views[0] || NOTION_LIKE_ENTITY_VIEWS[0]);
  let visibleColumns = $derived(columns.filter((column) => !column.hidden));
  let sortableColumns = $derived(visibleColumns.filter((column) => column.sortable !== false));
  let filteredRecords = $derived(filterAndSortRecords(records, visibleColumns, query, sortField, sortDirection));
  let selectedRecord = $derived(filteredRecords.find((record) => record.id === selectedId) || filteredRecords[0] || null);
  let boardGroups = $derived(groupRecords(filteredRecords, activeView.groupBy || "status"));
  let treeRows = $derived(flattenTree(filteredRecords, activeView.parentField || "parentId"));
  let calendarDays = $derived(buildCalendarDays(filteredRecords, activeView.dateField || "date", monthCursor));
  let timelineRecords = $derived(
    filteredRecords
      .map((record) => ({ record, ms: dateMs(fieldById(record, activeView.dateField || "date")) }))
      .filter((entry): entry is { record: EntityRecord; ms: number } => entry.ms !== null)
      .sort((a, b) => a.ms - b.ms),
  );

  $effect(() => {
    if (!activeViewId || !views.some((view) => view.id === activeViewId)) {
      activeViewId = defaultViewId || views[0]?.id || "table";
    }
  });

  $effect(() => {
    if (!selectedId || !records.some((record) => record.id === selectedId)) {
      selectedId = filteredRecords[0]?.id || "";
    }
  });

  function filterAndSortRecords(
    source: EntityRecord[],
    viewColumns: EntityColumn[],
    searchQuery: string,
    fieldId: string,
    direction: "asc" | "desc",
  ) {
    const normalized = searchQuery.trim().toLowerCase();
    const filtered = normalized
      ? source.filter((record) => recordSearchText(record, viewColumns).includes(normalized))
      : [...source];
    return fieldId ? sortRecords(filtered, fieldId, direction) : filtered;
  }

  function selectRecord(record: EntityRecord, notify = true) {
    selectedId = record.id;
    if (notify) onSelect?.(record);
  }

  function openRecord(record: EntityRecord) {
    selectedId = record.id;
    if (onOpen) {
      onOpen(record);
      return;
    }
    if (record.href && typeof window !== "undefined") window.location.href = record.href;
  }

  function actionHref(action: EntityViewAction, record: EntityRecord) {
    return action.href ? action.href(record) : "";
  }

  function actionKey(action: EntityViewAction, record: EntityRecord) {
    return `${record.id}:${action.id}`;
  }

  function isActionPending(action: EntityViewAction, record: EntityRecord) {
    return Boolean(pendingActionKeys[actionKey(action, record)]);
  }

  function isRecordActionPending(record: EntityRecord) {
    const prefix = `${record.id}:`;
    return Object.keys(pendingActionKeys).some((key) => key.startsWith(prefix));
  }

  function setActionPending(action: EntityViewAction, record: EntityRecord, pending: boolean) {
    const key = actionKey(action, record);
    if (pending) {
      pendingActionKeys = { ...pendingActionKeys, [key]: true };
      return;
    }
    const { [key]: _removed, ...rest } = pendingActionKeys;
    pendingActionKeys = rest;
  }

  function stopActionLink(event: MouseEvent, record: EntityRecord) {
    event.stopPropagation();
    if (isRecordActionPending(record)) event.preventDefault();
  }

  async function runAction(action: EntityViewAction, record: EntityRecord, event?: MouseEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!action.run || isRecordActionPending(record)) return;
    setActionPending(action, record, true);
    try {
      await action.run(record);
    } finally {
      setActionPending(action, record, false);
    }
  }

  function setView(view: EntityViewDefinition) {
    activeViewId = view.id;
  }

  function viewIcon(mode: EntityViewMode) {
    if (mode === "table") return Table2Icon;
    if (mode === "cards") return LayoutGridIcon;
    if (mode === "kanban") return KanbanIcon;
    if (mode === "list") return ListIcon;
    if (mode === "split") return PanelRightIcon;
    if (mode === "timeline") return ClockIcon;
    if (mode === "calendar") return CalendarDaysIcon;
    if (mode === "tree") return TreePineIcon;
    return FolderTreeIcon;
  }

  function valueClass(value: EntityFieldValue, type?: EntityColumn["type"]) {
    if (type === "status") return `status-chip ${statusKind(value)}`;
    if (type === "select" || type === "tags") return "tag-chip";
    if (type === "mono" || type === "number") return "mono-value";
    return "";
  }

  function displayValue(record: EntityRecord, column: EntityColumn) {
    const value = fieldValue(record, column);
    if (column.type === "date") return formatDate(value);
    return valueText(value) || "-";
  }

  function cellTitle(record: EntityRecord, column: EntityColumn) {
    return valueText(fieldValue(record, column));
  }

  function recordDate(record: EntityRecord, fieldId: string) {
    return fieldById(record, fieldId) || record.date || record.start || record.end;
  }

  function previousMonth() {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
  }

  function nextMonth() {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
  }

  function resetMonth() {
    monthCursor = startOfMonth(new Date());
  }

  function monthLabel(date: Date) {
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function dayKey(date: Date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  function buildCalendarDays(source: EntityRecord[], fieldId: string, cursor: Date) {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    start.setDate(1 - start.getDay());
    const byDay = new Map<string, EntityRecord[]>();
    for (const record of source) {
      const ms = dateMs(recordDate(record, fieldId));
      if (ms === null) continue;
      const key = dayKey(new Date(ms));
      byDay.set(key, [...(byDay.get(key) || []), record]);
    }
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = dayKey(date);
      return {
        key,
        date,
        inMonth: date.getMonth() === cursor.getMonth(),
        isToday: key === dayKey(new Date()),
        records: byDay.get(key) || [],
      };
    });
  }
</script>

{#snippet RecordActions(record: EntityRecord, placement: "row" | "card" | "detail" = "row")}
  {@const recordActions = visibleActions(actions, record)}
  {@const recordPending = isRecordActionPending(record)}
  {#if recordActions.length > 0}
    <div class={`entity-actions ${placement}`}>
      {#each recordActions as action (action.id)}
        {@const href = actionHref(action, record)}
        {@const actionPending = isActionPending(action, record)}
        {#if href}
          <a class={`entity-action ${action.variant || "secondary"}`} href={href} aria-disabled={recordPending} tabindex={recordPending ? -1 : undefined} onclick={(event) => stopActionLink(event, record)}>{action.label}</a>
        {:else}
          <button class={`entity-action ${action.variant || "secondary"}`} type="button" disabled={recordPending} aria-busy={actionPending} onclick={(event) => runAction(action, record, event)}>{action.label}</button>
        {/if}
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet StatusPill(value: EntityFieldValue)}
  <span class={`status-chip ${statusKind(value)}`}>
    <CircleIcon size={10} />
    {valueText(value) || "unknown"}
  </span>
{/snippet}

{#snippet RecordDetail(record: EntityRecord | null)}
  {#if record}
    <aside class="detail-panel">
      <header class="detail-header">
        <div>
          <p>{record.type || "Record"}</p>
          <h2>{record.title}</h2>
        </div>
        {#if record.status}
          {@render StatusPill(record.status)}
        {/if}
      </header>
      {#if record.description}
        <p class="detail-description">{record.description}</p>
      {/if}
      <dl class="detail-grid">
        <div>
          <dt>ID</dt>
          <dd class="mono-value">{record.id}</dd>
        </div>
        {#if record.subtitle}
          <div>
            <dt>Subtitle</dt>
            <dd>{record.subtitle}</dd>
          </div>
        {/if}
        {#each visibleColumns.filter((column) => !column.detailHidden) as column (column.id)}
          <div>
            <dt>{column.label}</dt>
            <dd class={valueClass(fieldValue(record, column), column.type)}>{displayValue(record, column)}</dd>
          </div>
        {/each}
      </dl>
      {@render RecordActions(record, "detail")}
    </aside>
  {:else}
    <aside class="detail-panel muted-detail">
      <BoxIcon size={18} />
      <span>Select a record</span>
    </aside>
  {/if}
{/snippet}

<section class="entity-view-shell" data-view-mode={activeView.mode}>
  <header class="entity-view-header">
    <div class="entity-title-block">
      <p>{records.length.toLocaleString()} records</p>
      <h1>{title}</h1>
      {#if description}<span>{description}</span>{/if}
    </div>
    <div class="entity-header-actions">
      {#if onRefresh}
        <button class="refresh-button" type="button" onclick={() => onRefresh?.()} disabled={loading}>
          {loading ? "Loading" : refreshLabel}
        </button>
      {/if}
    </div>
  </header>

  <div class="entity-toolbar">
    <div class="view-switcher" aria-label="View mode">
      {#each views as view (view.id)}
        {@const Icon = viewIcon(view.mode)}
        <button class:active={view.id === activeView.id} type="button" onclick={() => setView(view)} title={view.label}>
          <Icon size={14} />
          <span>{view.label}</span>
        </button>
      {/each}
    </div>
    <label class="search-box" aria-label="Search records">
      <SearchIcon size={15} />
      <input bind:value={query} placeholder="Search" />
    </label>
    <select class="sort-select" bind:value={sortField} aria-label="Sort field">
      <option value="">Manual</option>
      {#each sortableColumns as column (column.id)}
        <option value={column.id}>{column.label}</option>
      {/each}
    </select>
    <button class="sort-dir" type="button" onclick={() => (sortDirection = sortDirection === "asc" ? "desc" : "asc")} aria-label="Toggle sort direction">
      {sortDirection === "asc" ? "Asc" : "Desc"}
    </button>
  </div>

  {#if error}
    <div class="entity-banner error">{error}</div>
  {/if}

  {#if loading && filteredRecords.length === 0}
    <div class="entity-skeleton">
      {#each Array.from({ length: 6 }) as _}
        <span></span>
      {/each}
    </div>
  {:else if filteredRecords.length === 0}
    <div class="empty-state">
      <BoxIcon size={22} />
      <strong>{emptyTitle}</strong>
      <span>{emptyDescription}</span>
    </div>
  {:else if activeView.mode === "table"}
    <div class="table-view" style:grid-template-columns={`minmax(220px, 1.35fr) ${visibleColumns.map((column) => column.width || "minmax(130px, .75fr)").join(" ")} ${actions.length ? "auto" : ""}`}>
      <div class="table-head primary">Name</div>
      {#each visibleColumns as column (column.id)}
        <div class="table-head">{column.label}</div>
      {/each}
      {#if actions.length}<div class="table-head actions-head">Actions</div>{/if}
      {#each filteredRecords as record (record.id)}
        <button class:active={record.id === selectedRecord?.id} class="table-cell primary" type="button" onclick={() => selectRecord(record)} ondblclick={() => openRecord(record)}>
          <span>{record.title}</span>
          {#if record.subtitle}<small>{record.subtitle}</small>{/if}
        </button>
        {#each visibleColumns as column (column.id)}
          <button class="table-cell" type="button" onclick={() => selectRecord(record)} title={cellTitle(record, column)}>
            <span class={valueClass(fieldValue(record, column), column.type)}>{displayValue(record, column)}</span>
          </button>
        {/each}
        {#if actions.length}
          <div class="table-cell action-cell">{@render RecordActions(record)}</div>
        {/if}
      {/each}
    </div>
  {:else if activeView.mode === "cards"}
    <div class="card-view">
      {#each filteredRecords as record (record.id)}
        <article class:active={record.id === selectedRecord?.id} class="entity-card">
          <button class="entity-card-main" type="button" onclick={() => selectRecord(record)} ondblclick={() => openRecord(record)}>
            <header>
              <span class="entity-icon"><BoxIcon size={16} /></span>
              <div>
                <h2>{record.title}</h2>
                {#if record.subtitle}<p>{record.subtitle}</p>{/if}
              </div>
              {#if record.status}{@render StatusPill(record.status)}{/if}
            </header>
            {#if record.description}<p class="card-description">{record.description}</p>{/if}
            <dl>
              {#each visibleColumns.filter((column) => !column.cardHidden).slice(0, 5) as column (column.id)}
                <div>
                  <dt>{column.label}</dt>
                  <dd class={valueClass(fieldValue(record, column), column.type)}>{displayValue(record, column)}</dd>
                </div>
              {/each}
            </dl>
          </button>
          {@render RecordActions(record, "card")}
        </article>
      {/each}
    </div>
  {:else if activeView.mode === "kanban"}
    <div class="kanban-view">
      {#each boardGroups as group (group.value)}
        <section class="kanban-column">
          <header>
            <span>{group.label}</span>
            <strong>{group.records.length}</strong>
          </header>
          <div class="kanban-stack">
            {#each group.records as record (record.id)}
              <button class:active={record.id === selectedRecord?.id} type="button" onclick={() => selectRecord(record)} ondblclick={() => openRecord(record)}>
                <strong>{record.title}</strong>
                {#if record.description}<span>{record.description}</span>{/if}
                {#if record.status}{@render StatusPill(record.status)}{/if}
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else if activeView.mode === "list"}
    <div class="list-view">
      {#each filteredRecords as record (record.id)}
        <div class:active={record.id === selectedRecord?.id} class="list-row">
          <button class="list-row-main" type="button" onclick={() => selectRecord(record)} ondblclick={() => openRecord(record)}>
            <span class="entity-icon"><BoxIcon size={15} /></span>
            <span class="list-main">
              <strong>{record.title}</strong>
              <small>{record.subtitle || record.description || record.id}</small>
            </span>
            {#if record.status}{@render StatusPill(record.status)}{/if}
          </button>
          {@render RecordActions(record)}
        </div>
      {/each}
    </div>
  {:else if activeView.mode === "split"}
    <div class="split-view">
      <div class="split-list">
        {#each filteredRecords as record (record.id)}
          <button class:active={record.id === selectedRecord?.id} type="button" onclick={() => selectRecord(record)}>
            <strong>{record.title}</strong>
            <span>{record.subtitle || record.description || record.id}</span>
          </button>
        {/each}
      </div>
      {@render RecordDetail(selectedRecord)}
    </div>
  {:else if activeView.mode === "timeline"}
    <div class="timeline-view">
      {#if timelineRecords.length === 0}
        <div class="empty-state compact">No dated records for this view.</div>
      {:else}
        {#each timelineRecords as item (item.record.id)}
          <button class:active={item.record.id === selectedRecord?.id} type="button" onclick={() => selectRecord(item.record)} ondblclick={() => openRecord(item.record)}>
            <span class="timeline-dot"></span>
            <time>{formatDate(item.record.date || item.record.fields?.[activeView.dateField || "date"])}</time>
            <strong>{item.record.title}</strong>
            {#if item.record.status}{@render StatusPill(item.record.status)}{/if}
          </button>
        {/each}
      {/if}
    </div>
  {:else if activeView.mode === "calendar"}
    <div class="calendar-view">
      <div class="calendar-bar">
        <button type="button" onclick={previousMonth} aria-label="Previous month"><ChevronLeftIcon size={15} /></button>
        <strong>{monthLabel(monthCursor)}</strong>
        <button type="button" onclick={resetMonth}>Today</button>
        <button type="button" onclick={nextMonth} aria-label="Next month"><ChevronRightIcon size={15} /></button>
      </div>
      <div class="calendar-weekdays">
        {#each ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as weekday}
          <span>{weekday}</span>
        {/each}
      </div>
      <div class="calendar-grid">
        {#each calendarDays as day (day.key)}
          <div class:muted={!day.inMonth} class:today={day.isToday}>
            <span class="day-number">{day.date.getDate()}</span>
            {#each day.records.slice(0, 3) as record (record.id)}
              <button type="button" onclick={() => selectRecord(record)}>{record.title}</button>
            {/each}
            {#if day.records.length > 3}<small>+{day.records.length - 3} more</small>{/if}
          </div>
        {/each}
      </div>
    </div>
  {:else if activeView.mode === "tree"}
    <div class="tree-view">
      {#each treeRows as row (row.record.id)}
        <button class:active={row.record.id === selectedRecord?.id} type="button" style:padding-left={`${0.75 + row.depth * 1.25}rem`} onclick={() => selectRecord(row.record)} ondblclick={() => openRecord(row.record)}>
          <TreePineIcon size={14} />
          <strong>{row.record.title}</strong>
          <span>{row.record.subtitle || row.record.type || row.record.id}</span>
          {#if row.record.status}{@render StatusPill(row.record.status)}{/if}
        </button>
      {/each}
    </div>
  {:else}
    <div class="icon-view">
      {#each filteredRecords as record (record.id)}
        <button class:active={record.id === selectedRecord?.id} type="button" onclick={() => selectRecord(record)} ondblclick={() => openRecord(record)}>
          <span><BoxIcon size={22} /></span>
          <strong>{record.title}</strong>
          {#if record.status}<small>{record.status}</small>{/if}
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .entity-view-shell {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.875rem;
    color: var(--shadcn-foreground);
  }

  .entity-view-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid var(--shadcn-border);
    padding-bottom: 0.875rem;
  }

  .entity-title-block {
    min-width: 0;
  }

  .entity-title-block p,
  .entity-title-block span {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .entity-title-block h1 {
    margin: 0.15rem 0 0;
    color: var(--shadcn-foreground);
    font-size: 1.625rem;
    font-weight: 650;
    letter-spacing: 0;
    line-height: 1.15;
  }

  .entity-header-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.5rem;
  }

  .refresh-button,
  .sort-dir,
  .entity-action,
  .calendar-bar button {
    display: inline-flex;
    min-height: 2.25rem;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--shadcn-input);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: 0;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease, opacity 0.15s ease;
  }

  .refresh-button,
  .sort-dir {
    padding: 0 0.75rem;
  }

  .refresh-button:hover,
  .sort-dir:hover,
  .entity-action:hover,
  .calendar-bar button:hover {
    background: var(--shadcn-accent);
    border-color: var(--shadcn-border);
  }

  .refresh-button:active,
  .sort-dir:active,
  .entity-action:active,
  .calendar-bar button:active {
    transform: translateY(1px);
  }

  .refresh-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .entity-action:disabled,
  .entity-action[aria-disabled="true"] {
    cursor: not-allowed;
    opacity: 0.55;
    pointer-events: none;
    transform: none;
  }

  .entity-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(180px, 260px) minmax(120px, 180px) auto;
    gap: 0.5rem;
    align-items: center;
  }

  .view-switcher {
    display: flex;
    min-width: 0;
    gap: 0.25rem;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .view-switcher button {
    display: inline-flex;
    min-height: 2rem;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid transparent;
    border-radius: calc(var(--shadcn-radius) - 2px);
    padding: 0 0.6rem;
    background: transparent;
    color: var(--shadcn-muted-foreground);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
  }

  .view-switcher button:hover,
  .view-switcher button.active {
    border-color: var(--shadcn-border);
    background: var(--shadcn-accent);
    color: var(--shadcn-foreground);
  }

  .search-box {
    display: flex;
    min-width: 0;
    min-height: 2.25rem;
    align-items: center;
    gap: 0.45rem;
    border: 1px solid var(--shadcn-input);
    border-radius: var(--shadcn-radius);
    padding: 0 0.625rem;
    background: var(--shadcn-background);
    color: var(--shadcn-muted-foreground);
  }

  .search-box input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--shadcn-foreground);
    font: inherit;
    font-size: 0.875rem;
  }

  .sort-select {
    min-width: 0;
    min-height: 2.25rem;
    border: 1px solid var(--shadcn-input);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    font: inherit;
    font-size: 0.8125rem;
    padding: 0 0.625rem;
  }

  .entity-banner,
  .empty-state {
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
  }

  .entity-banner {
    padding: 0.875rem 1rem;
    color: var(--shadcn-destructive);
    border-color: color-mix(in srgb, var(--shadcn-destructive) 24%, var(--shadcn-border));
  }

  .empty-state {
    display: grid;
    min-height: 15rem;
    place-items: center;
    align-content: center;
    gap: 0.35rem;
    padding: 2rem;
    color: var(--shadcn-muted-foreground);
    text-align: center;
  }

  .empty-state strong {
    color: var(--shadcn-foreground);
    font-size: 0.95rem;
  }

  .empty-state.compact {
    min-height: 11rem;
  }

  .entity-skeleton {
    display: grid;
    gap: 0.5rem;
  }

  .entity-skeleton span {
    display: block;
    height: 2.75rem;
    border-radius: var(--shadcn-radius);
    background: linear-gradient(90deg, var(--shadcn-muted), var(--shadcn-accent), var(--shadcn-muted));
    background-size: 220% 100%;
    animation: shimmer 1.2s ease-in-out infinite;
  }

  .table-view {
    display: grid;
    width: 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
  }

  .table-head,
  .table-cell {
    min-width: 0;
    border-bottom: 1px solid var(--shadcn-border);
    border-left: 1px solid var(--shadcn-border);
    padding: 0.625rem 0.75rem;
  }

  .table-head:first-child,
  .table-cell.primary {
    border-left: 0;
  }

  .table-head {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 650;
    background: var(--shadcn-muted);
  }

  .table-cell {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    background: var(--shadcn-card);
    color: var(--shadcn-foreground);
    font: inherit;
    font-size: 0.8375rem;
    text-align: left;
  }

  .table-cell:hover,
  .table-cell.active {
    background: var(--shadcn-accent);
  }

  .table-cell.primary {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 0.15rem;
    font-weight: 600;
  }

  .table-cell small {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  .action-cell {
    justify-content: flex-end;
  }

  .card-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0.875rem;
  }

  .entity-card {
    display: flex;
    min-height: 13rem;
    flex-direction: column;
    gap: 0.875rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 1rem;
    background: var(--shadcn-card);
    color: var(--shadcn-foreground);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
  }

  .entity-card:hover,
  .entity-card.active {
    border-color: color-mix(in srgb, var(--shadcn-foreground) 18%, var(--shadcn-border));
    background: var(--shadcn-card);
  }

  .entity-card-main {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 0.875rem;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .entity-card-main header {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .entity-card-main h2,
  .entity-card-main p {
    margin: 0;
  }

  .entity-card-main h2 {
    color: var(--shadcn-foreground);
    font-size: 0.975rem;
    font-weight: 650;
    line-height: 1.3;
  }

  .entity-card-main header p,
  .card-description {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .entity-icon {
    display: grid;
    width: 2rem;
    height: 2rem;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    background: var(--shadcn-muted);
    color: var(--shadcn-muted-foreground);
  }

  .entity-card-main dl {
    display: grid;
    gap: 0.45rem;
    margin: 0;
  }

  .entity-card-main dl div,
  .detail-grid div {
    display: grid;
    grid-template-columns: minmax(80px, 0.55fr) minmax(0, 1fr);
    gap: 0.75rem;
    align-items: baseline;
  }

  dt {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--shadcn-foreground);
    font-size: 0.8125rem;
  }

  .kanban-view {
    display: flex;
    min-height: 26rem;
    gap: 0.875rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }

  .kanban-column {
    display: flex;
    width: 17.5rem;
    flex: 0 0 17.5rem;
    flex-direction: column;
    gap: 0.625rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
    padding: 0.625rem;
  }

  .kanban-column header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    font-weight: 650;
  }

  .kanban-column header strong {
    color: var(--shadcn-muted-foreground);
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .kanban-stack {
    display: grid;
    gap: 0.5rem;
  }

  .kanban-stack button,
  .list-row-main,
  .split-list button,
  .tree-view button {
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    background: var(--shadcn-card);
    color: var(--shadcn-foreground);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .kanban-stack button {
    display: grid;
    gap: 0.45rem;
    padding: 0.75rem;
  }

  .kanban-stack button span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    line-height: 1.35;
  }

  .kanban-stack button:hover,
  .kanban-stack button.active,
  .list-row:hover .list-row-main,
  .list-row.active .list-row-main,
  .split-list button:hover,
  .split-list button.active,
  .tree-view button:hover,
  .tree-view button.active {
    background: var(--shadcn-accent);
  }

  .list-view {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
  }

  .list-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    min-height: 3.25rem;
    border-width: 0 0 1px;
    border-radius: 0;
    border-bottom: 1px solid var(--shadcn-border);
  }

  .list-row:last-child {
    border-bottom: 0;
  }

  .list-row-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    min-height: 3.25rem;
    border: 0;
    border-radius: 0;
    padding: 0.625rem 0.75rem;
  }

  .list-row > .entity-actions {
    padding-right: 0.75rem;
  }

  .list-main {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }

  .list-main strong,
  .list-main small,
  .split-list strong,
  .split-list span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-main small,
  .split-list span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  .split-view {
    display: grid;
    grid-template-columns: minmax(240px, 0.42fr) minmax(0, 1fr);
    min-height: 32rem;
    overflow: hidden;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
  }

  .split-list {
    display: grid;
    align-content: start;
    overflow-y: auto;
    border-right: 1px solid var(--shadcn-border);
  }

  .split-list button {
    display: grid;
    gap: 0.2rem;
    min-height: 3.5rem;
    border-width: 0 0 1px;
    border-radius: 0;
    padding: 0.75rem;
  }

  .detail-panel {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: var(--shadcn-card);
  }

  .muted-detail {
    align-items: center;
    justify-content: center;
    color: var(--shadcn-muted-foreground);
  }

  .detail-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--shadcn-border);
  }

  .detail-header p,
  .detail-header h2,
  .detail-description {
    margin: 0;
  }

  .detail-header p {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  .detail-header h2 {
    margin-top: 0.2rem;
    font-size: 1.25rem;
    line-height: 1.2;
  }

  .detail-description {
    color: var(--shadcn-muted-foreground);
    line-height: 1.5;
  }

  .detail-grid {
    display: grid;
    gap: 0.625rem;
    margin: 0;
  }

  .detail-grid dd.mono-value {
    max-height: 24rem;
    overflow: auto;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .timeline-view {
    display: grid;
    border-left: 1px solid var(--shadcn-border);
    margin-left: 0.5rem;
  }

  .timeline-view button {
    display: grid;
    grid-template-columns: 1rem minmax(88px, auto) minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: center;
    border: 0;
    border-bottom: 1px solid var(--shadcn-border);
    background: transparent;
    color: var(--shadcn-foreground);
    font: inherit;
    min-height: 3.25rem;
    padding: 0.65rem 0.75rem 0.65rem 0;
    text-align: left;
    cursor: pointer;
  }

  .timeline-view button:hover,
  .timeline-view button.active {
    background: var(--shadcn-accent);
  }

  .timeline-dot {
    width: 0.65rem;
    height: 0.65rem;
    border: 2px solid var(--shadcn-background);
    border-radius: 999px;
    background: var(--shadcn-foreground);
    transform: translateX(-0.36rem);
  }

  .timeline-view time {
    color: var(--shadcn-muted-foreground);
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .calendar-view {
    overflow: hidden;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
  }

  .calendar-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-bottom: 1px solid var(--shadcn-border);
    padding: 0.625rem;
  }

  .calendar-bar strong {
    margin-right: auto;
  }

  .calendar-bar button {
    min-height: 1.875rem;
    padding: 0 0.55rem;
  }

  .calendar-weekdays,
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .calendar-weekdays {
    border-bottom: 1px solid var(--shadcn-border);
    background: var(--shadcn-muted);
  }

  .calendar-weekdays span {
    padding: 0.5rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 650;
  }

  .calendar-grid div {
    min-height: 6.25rem;
    border-bottom: 1px solid var(--shadcn-border);
    border-right: 1px solid var(--shadcn-border);
    padding: 0.45rem;
  }

  .calendar-grid div.muted {
    background: var(--shadcn-muted);
    color: var(--shadcn-muted-foreground);
  }

  .calendar-grid div.today .day-number {
    background: var(--shadcn-foreground);
    color: var(--shadcn-background);
  }

  .day-number {
    display: grid;
    width: 1.45rem;
    height: 1.45rem;
    place-items: center;
    border-radius: 999px;
    font-size: 0.75rem;
  }

  .calendar-grid button {
    display: block;
    width: 100%;
    overflow: hidden;
    border: 0;
    border-radius: calc(var(--shadcn-radius) - 4px);
    margin-top: 0.25rem;
    padding: 0.2rem 0.35rem;
    background: var(--shadcn-accent);
    color: var(--shadcn-foreground);
    font: inherit;
    font-size: 0.7rem;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .calendar-grid small {
    display: block;
    margin-top: 0.2rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.7rem;
  }

  .tree-view {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
  }

  .tree-view button {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 0.8fr) auto;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.85rem;
    border-width: 0 0 1px;
    border-radius: 0;
    padding-right: 0.75rem;
  }

  .tree-view button:last-child {
    border-bottom: 0;
  }

  .tree-view strong,
  .tree-view span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tree-view span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  .icon-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 0.75rem;
  }

  .icon-view button {
    display: grid;
    min-height: 7rem;
    justify-items: center;
    align-content: center;
    gap: 0.45rem;
    border: 1px solid transparent;
    border-radius: var(--shadcn-radius);
    background: transparent;
    color: var(--shadcn-foreground);
    font: inherit;
    text-align: center;
    cursor: pointer;
  }

  .icon-view button:hover,
  .icon-view button.active {
    border-color: var(--shadcn-border);
    background: var(--shadcn-accent);
  }

  .icon-view span {
    display: grid;
    width: 3rem;
    height: 3rem;
    place-items: center;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) + 2px);
    background: var(--shadcn-card);
    color: var(--shadcn-muted-foreground);
  }

  .icon-view strong {
    max-width: 6.25rem;
    overflow: hidden;
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .icon-view small {
    color: var(--shadcn-muted-foreground);
    font-size: 0.7rem;
  }

  .status-chip,
  .tag-chip,
  .mono-value {
    display: inline-flex;
    max-width: 100%;
    align-items: center;
    gap: 0.35rem;
    overflow: hidden;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    padding: 0.125rem 0.45rem;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-chip.success {
    border-color: color-mix(in srgb, var(--success) 24%, var(--shadcn-border));
    color: var(--success);
  }

  .status-chip.warning {
    border-color: color-mix(in srgb, var(--warning) 28%, var(--shadcn-border));
    color: var(--warning);
  }

  .status-chip.danger {
    border-color: color-mix(in srgb, var(--shadcn-destructive) 26%, var(--shadcn-border));
    color: var(--shadcn-destructive);
  }

  .status-chip.muted,
  .tag-chip,
  .mono-value {
    color: var(--shadcn-muted-foreground);
    background: var(--shadcn-muted);
  }

  .mono-value {
    font-family: var(--font-mono);
  }

  .entity-actions {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .entity-actions.card {
    margin-top: auto;
  }

  .entity-actions.detail {
    margin-top: auto;
    padding-top: 0.75rem;
    border-top: 1px solid var(--shadcn-border);
  }

  .entity-action {
    min-height: 1.875rem;
    padding: 0 0.55rem;
  }

  .entity-action.default {
    border-color: color-mix(in srgb, var(--shadcn-foreground) 18%, var(--shadcn-border));
    background: var(--shadcn-foreground);
    color: var(--shadcn-background);
  }

  .entity-action.destructive {
    border-color: color-mix(in srgb, var(--shadcn-destructive) 30%, var(--shadcn-border));
    color: var(--shadcn-destructive);
  }

  @keyframes shimmer {
    from {
      background-position: 120% 0;
    }
    to {
      background-position: -120% 0;
    }
  }

  @media (max-width: 900px) {
    .entity-toolbar {
      grid-template-columns: 1fr;
    }

    .split-view {
      grid-template-columns: 1fr;
    }

    .split-list {
      max-height: 16rem;
      border-right: 0;
      border-bottom: 1px solid var(--shadcn-border);
    }

    .table-view {
      overflow-x: auto;
    }
  }
</style>
