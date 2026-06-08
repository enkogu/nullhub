<script lang="ts">
  import { tick } from "svelte";
  import type { StandaloneInfo } from "$lib/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import XIcon from "@lucide/svelte/icons/x";

  let {
    open = false,
    component = "nullclaw",
    displayName = "NullClaw",
    standalone = null as StandaloneInfo | null,
    importing = false,
    error = "",
    onClose = () => {},
    onSubmit = async (_payload: { path?: string; name?: string }) => {},
  } = $props();

  let path = $state("");
  let name = $state("");
  let dialogEl = $state<HTMLDivElement | null>(null);
  let pathInputEl = $state<HTMLInputElement | null>(null);
  let previouslyFocused: HTMLElement | null = null;
  const titleId = "add-existing-title";
  let defaultPathPlaceholder = $derived(`/Users/you/.${component}`);

  $effect(() => {
    if (!open) return;
    path = standalone?.standalone && !standalone?.already_imported ? (standalone.standalone_path ?? "") : "";
    name = "";
  });

  $effect(() => {
    if (!open || typeof document === "undefined") return;
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void tick().then(() => {
      pathInputEl?.focus();
    });

    return () => {
      previouslyFocused?.focus();
      previouslyFocused = null;
    };
  });

  $effect(() => {
    if (!open || typeof window === "undefined") return;
    window.addEventListener("keydown", handleDialogKeydown);
    return () => {
      window.removeEventListener("keydown", handleDialogKeydown);
    };
  });

  const canSubmit = $derived(!importing && path.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    await onSubmit({
      path: path.trim(),
      name: name.trim() || undefined,
    });
  }

  function close() {
    if (importing) return;
    onClose();
  }

  function focusableElements(): HTMLElement[] {
    if (!dialogEl) return [];
    return Array.from(
      dialogEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
  }

  function handleDialogKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;

    const items = focusableElements();
    if (items.length === 0) {
      e.preventDefault();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

{#if open}
  <div class="modal-backdrop">
    <button
      type="button"
      class="modal-backdrop-button"
      aria-label="Close dialog"
      onclick={close}
      disabled={importing}
    ></button>
    <div
      bind:this={dialogEl}
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabindex="-1"
    >
      <div class="modal-header">
        <div>
          <div class="modal-title" id={titleId}>Add existing {displayName}</div>
          <div class="modal-subtitle">Register a local {displayName} home already on this machine.</div>
        </div>
        <button type="button" class="modal-close" onclick={close} aria-label="Close">
          <XIcon size={16} />
        </button>
      </div>

      <div class="modal-body">
        <div class="form-field">
          <Label for="existing-path">Instance path</Label>
          <Input
            id="existing-path"
            bind:ref={pathInputEl}
            bind:value={path}
            placeholder={defaultPathPlaceholder}
            autocomplete="off"
            spellcheck="false"
          />
          <div class="form-hint">
            Path to the existing {displayName} directory containing <code>config.json</code>.
          </div>
        </div>

        <div class="form-field">
          <Label for="existing-name">Instance name</Label>
          <Input
            id="existing-name"
            bind:value={name}
            placeholder="Optional"
            autocomplete="off"
            spellcheck="false"
          />
          <div class="form-hint">
            Leave blank to use <code>instance_name</code> from config or let the server generate one. Use letters, numbers, dots, underscores, or hyphens.
          </div>
        </div>

        {#if standalone?.standalone && standalone.standalone_path}
          <div class="detected-note {standalone.already_imported ? 'muted' : ''}">
            Default install detected at <code>{standalone.standalone_path}</code>
            {#if standalone.already_imported}
              and already imported.
            {:else}
              and ready to attach.
            {/if}
          </div>
        {/if}

        {#if error}
          <div class="form-error">{error}</div>
        {/if}
      </div>

      <div class="modal-actions">
        <Button variant="outline" onclick={close} disabled={importing}>Cancel</Button>
        <Button onclick={handleSubmit} disabled={!canSubmit}>
          {importing ? "Importing..." : "Add existing"}
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1.5rem;
  }

  .modal-backdrop-button {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .modal-backdrop-button:disabled {
    cursor: default;
  }

  .modal {
    position: relative;
    z-index: 1;
    width: min(560px, calc(100vw - 2rem));
    background: var(--shadcn-card);
    color: var(--shadcn-foreground);
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) + 2px);
    box-shadow: 0 24px 48px -12px rgb(0 0 0 / 0.22);
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.25rem 1.25rem 1rem;
    border-bottom: 1px solid var(--shadcn-border);
  }

  .modal-title {
    font-size: 1.0625rem;
    font-weight: 600;
    line-height: 1.3;
    color: var(--shadcn-foreground);
  }

  .modal-subtitle {
    margin-top: 0.25rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .modal-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 1.75rem;
    width: 1.75rem;
    background: none;
    border: 0;
    border-radius: calc(var(--shadcn-radius) - 2px);
    color: var(--shadcn-muted-foreground);
    cursor: pointer;
    transition: background-color 0.12s ease, color 0.12s ease;
  }

  .modal-close:hover {
    background: var(--shadcn-accent);
    color: var(--shadcn-foreground);
  }

  .modal-body {
    padding: 1.25rem;
    display: grid;
    gap: 1rem;
  }

  .form-field {
    display: grid;
    gap: 0.5rem;
  }

  .form-hint {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    line-height: 1.45;
  }

  .form-hint code,
  .detected-note code {
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.8125em;
    color: var(--shadcn-foreground);
  }

  .detected-note {
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    background: var(--shadcn-muted);
    color: var(--shadcn-foreground);
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .detected-note.muted {
    color: var(--shadcn-muted-foreground);
  }

  .form-error {
    color: var(--shadcn-destructive);
    font-size: 0.8125rem;
    line-height: 1.45;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0 1.25rem 1.25rem;
  }

  @media (max-width: 640px) {
    .modal-actions {
      flex-direction: column-reverse;
    }

    .modal-actions :global([data-slot="button"]) {
      width: 100%;
    }
  }
</style>
