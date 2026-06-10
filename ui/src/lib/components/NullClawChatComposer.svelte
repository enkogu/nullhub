<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SquareIcon from "@lucide/svelte/icons/square";

  let {
    disabled = false,
    running = false,
    placeholder = "Type your message...",
    focusKey = "",
    onSubmit = () => {},
    onCancel = () => {},
  } = $props<{
    disabled?: boolean;
    running?: boolean;
    placeholder?: string;
    focusKey?: string;
    onSubmit?: (text: string) => void | Promise<void>;
    onCancel?: () => void;
  }>();

  const COMPOSER_TEXTAREA_MIN_HEIGHT = 54;
  const COMPOSER_TEXTAREA_MAX_HEIGHT = 184;

  let draft = $state("");
  let textarea: HTMLTextAreaElement | null = $state(null);
  let host: HTMLDivElement | null = $state(null);

  const canSubmit = $derived(!disabled && !running && draft.trim().length > 0);

  function resizeComposerTextarea() {
    if (!textarea) return;
    textarea.style.minHeight = `${COMPOSER_TEXTAREA_MIN_HEIGHT}px`;
    textarea.style.maxHeight = `${COMPOSER_TEXTAREA_MAX_HEIGHT}px`;
    textarea.style.height = `${COMPOSER_TEXTAREA_MIN_HEIGHT}px`;
    const nextHeight =
      textarea.value.length === 0
        ? COMPOSER_TEXTAREA_MIN_HEIGHT
        : Math.min(
            COMPOSER_TEXTAREA_MAX_HEIGHT,
            Math.max(COMPOSER_TEXTAREA_MIN_HEIGHT, Math.ceil(textarea.scrollHeight)),
          );
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > COMPOSER_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  }

  async function resetComposer() {
    draft = "";
    await tick();
    resizeComposerTextarea();
  }

  async function submitDraft(event?: SubmitEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || disabled || running) return;
    await onSubmit(text);
    await resetComposer();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitDraft();
    }
  }

  $effect(() => {
    draft;
    focusKey;
    void tick().then(resizeComposerTextarea);
  });

  onMount(() => {
    void tick().then(() => {
      resizeComposerTextarea();
      textarea?.focus({ preventScroll: true });
    });

    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resizeComposerTextarea);
    observer.observe(host);
    return () => observer.disconnect();
  });
</script>

<form
  class="chat-composer"
  class:disabled
  onsubmit={submitDraft}
  aria-label="Message composer"
>
  <div class="textarea-host" bind:this={host}>
    <Textarea
      bind:ref={textarea}
      bind:value={draft}
      class="chat-composer-textarea"
      rows="1"
      {placeholder}
      {disabled}
      spellcheck="true"
      onkeydown={handleKeydown}
      aria-label="Message"
    />
  </div>

  <div class="composer-controls">
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      class="composer-action attach"
      disabled
      title="Attachments are not available yet"
      aria-label="Attach documents"
    >
      <PlusIcon />
    </Button>

    <Button
      type={running ? "button" : "submit"}
      variant={running ? "secondary" : "default"}
      size="icon-sm"
      class={`composer-action send ${running ? "running" : ""}`}
      disabled={running ? false : !canSubmit}
      onclick={() => {
        if (running) onCancel();
      }}
      aria-label={running ? "Stop response" : "Send"}
      title={running ? "Stop response" : "Send"}
    >
      {#if running}
        <SquareIcon />
      {:else}
        <ArrowUpIcon />
      {/if}
    </Button>
  </div>
</form>

<style>
  .chat-composer {
    position: relative;
    display: grid;
    grid-template-rows: auto 38px;
    overflow: hidden;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) + 10px);
    background: var(--shadcn-card);
    box-shadow:
      0 14px 32px -30px rgba(15, 23, 42, 0.38),
      0 1px 8px -7px rgba(15, 23, 42, 0.18);
    transition:
      border-color 180ms cubic-bezier(0.2, 0, 0, 1),
      background-color 180ms cubic-bezier(0.2, 0, 0, 1),
      box-shadow 180ms cubic-bezier(0.2, 0, 0, 1);
  }

  .chat-composer:focus-within {
    border-color: color-mix(in srgb, var(--shadcn-foreground) 22%, var(--shadcn-border));
    box-shadow:
      0 18px 44px -34px rgba(15, 23, 42, 0.44),
      0 2px 12px -9px rgba(15, 23, 42, 0.22);
  }

  .chat-composer.disabled {
    opacity: 0.72;
  }

  .textarea-host {
    position: relative;
    min-width: 0;
    overflow: hidden;
  }

  :global(.chat-composer-textarea) {
    min-height: 54px;
    max-height: 184px;
    resize: none;
    overflow: hidden;
    border: 0 !important;
    border-radius: 0;
    background: transparent !important;
    font-size: 14px;
    line-height: 20px;
    padding: 12px 14px 8px;
    box-shadow: none !important;
    outline: none !important;
  }

  :global(.chat-composer-textarea:focus),
  :global(.chat-composer-textarea:focus-visible) {
    border-color: transparent !important;
    box-shadow: none !important;
    outline: none !important;
  }

  .composer-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 8px;
  }

  :global(.composer-action) {
    border-radius: 999px;
  }

  :global(.composer-action.send) {
    box-shadow: 0 5px 16px -7px rgba(15, 23, 42, 0.32);
  }
</style>
