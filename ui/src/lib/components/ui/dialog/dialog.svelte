<script lang="ts">
  import type { Snippet } from "svelte";
  import XIcon from "@lucide/svelte/icons/x";
  import { cn } from "$lib/utils.js";

  let {
    open = $bindable(false),
    title = "",
    description = "",
    size = "md",
    children,
    footer,
    class: className = "",
  }: {
    open?: boolean;
    title?: string;
    description?: string;
    size?: "sm" | "md" | "lg";
    children?: Snippet;
    footer?: Snippet;
    class?: string;
  } = $props();

  const maxWidth = { sm: "26rem", md: "34rem", lg: "48rem" } as const;

  function close() {
    open = false;
  }

  function onkeydown(event: KeyboardEvent) {
    if (open && event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  function onContentKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    event.stopPropagation();
  }
</script>

<svelte:window {onkeydown} />

{#if open}
  <div class="dialog-overlay" role="presentation" onclick={close}>
    <div
      class={cn("dialog-content", className)}
      style:max-width={maxWidth[size]}
      role="dialog"
      aria-modal="true"
      aria-label={title || undefined}
      onclick={(event) => event.stopPropagation()}
      onkeydown={onContentKeydown}
      tabindex="-1"
    >
      <button class="dialog-close" type="button" onclick={close} aria-label="Close">
        <XIcon size={16} />
      </button>
      {#if title || description}
        <header class="dialog-head">
          {#if title}<h2 class="dialog-title">{title}</h2>{/if}
          {#if description}<p class="dialog-desc">{description}</p>{/if}
        </header>
      {/if}
      <div class="dialog-body">
        {@render children?.()}
      </div>
      {#if footer}
        <footer class="dialog-footer">{@render footer()}</footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background: rgb(0 0 0 / 0.45);
    animation: dialog-fade 0.12s ease;
  }

  .dialog-content {
    position: relative;
    display: flex;
    width: 100%;
    max-height: calc(100dvh - 3rem);
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) + 2px);
    padding: 1.5rem;
    background: var(--shadcn-card);
    color: var(--shadcn-foreground);
    box-shadow: 0 24px 48px -12px rgb(0 0 0 / 0.22);
    animation: dialog-pop 0.14s ease;
  }

  .dialog-close {
    position: absolute;
    top: 0.875rem;
    right: 0.875rem;
    display: inline-flex;
    height: 1.75rem;
    width: 1.75rem;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: calc(var(--shadcn-radius) - 2px);
    background: transparent;
    color: var(--shadcn-muted-foreground);
    cursor: pointer;
    transition: background-color 0.12s ease, color 0.12s ease;
  }

  .dialog-close:hover {
    background: var(--shadcn-accent);
    color: var(--shadcn-foreground);
  }

  .dialog-head {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-right: 2rem;
  }

  .dialog-title {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .dialog-desc {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .dialog-body {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.875rem;
  }

  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  @keyframes dialog-fade {
    from {
      opacity: 0;
    }
  }

  @keyframes dialog-pop {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.99);
    }
  }
</style>
