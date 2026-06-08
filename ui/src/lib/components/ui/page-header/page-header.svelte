<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    subtitle = "",
    controls,
    actions,
    align = "center",
  }: {
    title: string;
    subtitle?: string;
    /** Inline controls (view switcher, search, filters) shown on the trailing edge. */
    controls?: Snippet;
    /** Primary actions (Refresh, + New) shown after the controls. */
    actions?: Snippet;
    align?: "center" | "start";
  } = $props();
</script>

<header class="page-header" data-align={align}>
  <div class="ph-text">
    <h1 title={title}>{title}</h1>
    {#if subtitle}<p title={subtitle}>{subtitle}</p>{/if}
  </div>
  {#if controls || actions}
    <div class="ph-controls">
      {#if controls}{@render controls()}{/if}
      {#if actions}<div class="ph-actions">{@render actions()}</div>{/if}
    </div>
  {/if}
</header>

<style>
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: nowrap;
    gap: 0.75rem 1.25rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--shadcn-border);
  }

  .page-header[data-align="start"] {
    align-items: flex-start;
  }

  .ph-text {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.1rem;
  }

  .ph-text h1 {
    margin: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--shadcn-foreground);
    font-size: 1.375rem;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.012em;
  }

  .ph-text p {
    margin: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .ph-controls {
    display: flex;
    min-width: 0;
    flex: 0 0 auto;
    align-items: center;
    flex-wrap: nowrap;
    gap: 0.5rem;
  }

  .ph-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  @media (max-width: 860px) {
    .page-header {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .ph-text {
      flex-basis: 100%;
    }

    .ph-controls {
      width: 100%;
      flex-wrap: wrap;
    }
  }
</style>
