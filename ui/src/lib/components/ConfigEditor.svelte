<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import ConfigEditorUI from "./ConfigEditorUI.svelte";
  import StructuredConfigEditor from "./StructuredConfigEditor.svelte";
  import { supportsStructuredConfig } from "./componentConfigSchemas";
  import { Button } from "$lib/components/ui/button";
  import SaveIcon from "@lucide/svelte/icons/save";

  let {
    component = "",
    name = "",
    onAction = async () => {},
  }: {
    component?: string;
    name?: string;
    onAction?: () => void | Promise<void>;
  } = $props();
  let configObj = $state<any>({});
  let configText = $state("");
  let mode = $state<"ui" | "raw">("ui");
  let action = $state<"save" | "save-restart" | null>(null);
  let message = $state("");
  let error = $state(false);
  let loaded = $state(false);
  let supportsUi = $derived(
    component === "nullclaw" || supportsStructuredConfig(component),
  );
  let busy = $derived(action !== null);

  $effect(() => {
    if (!supportsUi && mode === "ui") {
      mode = "raw";
    }
  });

  async function load() {
    try {
      const data = await api.getConfig(component, name);
      configObj = typeof data === "string" ? JSON.parse(data) : data;
      configText = JSON.stringify(configObj, null, 2);
      message = "";
      error = false;
    } catch (e) {
      configObj = {};
      configText = "{}";
      message = "No config found, starting with empty object";
      error = false;
    }
    loaded = true;
  }

  function switchMode(newMode: "ui" | "raw") {
    if (newMode === mode) return;
    if (newMode === "raw") {
      configText = JSON.stringify(configObj, null, 2);
    } else {
      try {
        configObj = JSON.parse(configText);
      } catch (e) {
        message = "Invalid JSON — fix before switching to UI mode";
        error = true;
        return;
      }
    }
    mode = newMode;
    message = "";
    error = false;
  }

  function onUiChange() {
    message = "";
  }

  function currentConfig() {
    if (mode === "raw") {
      const parsed = JSON.parse(configText);
      configObj = parsed;
      return parsed;
    }
    configText = JSON.stringify(configObj, null, 2);
    return configObj;
  }

  async function save(restartAfterSave = false) {
    action = restartAfterSave ? "save-restart" : "save";
    let saved = false;
    try {
      const toSave = currentConfig();
      await api.putConfig(component, name, toSave);
      saved = true;

      if (restartAfterSave) {
        await api.restartInstance(component, name);
        message = "Config saved. Instance restarting";
      } else {
        message = "Config saved";
      }

      error = false;
      await onAction();
    } catch (e) {
      const err = (e as Error).message;
      if (saved && restartAfterSave) {
        message = `Config saved, but restart failed: ${err}`;
      } else {
        message = `Error: ${err}`;
      }
      error = true;
    } finally {
      action = null;
    }
  }

  onMount(() => { load(); });
</script>

<div class="config-editor">
  <div class="editor-header">
    {#if supportsUi}
      <div class="mode-toggle">
        <button class="mode-btn" class:active={mode === 'ui'} onclick={() => switchMode('ui')}>UI</button>
        <button class="mode-btn" class:active={mode === 'raw'} onclick={() => switchMode('raw')}>Raw</button>
      </div>
    {:else}
      <div class="mode-toggle">
        <button class="mode-btn active">Raw</button>
      </div>
    {/if}
    <div class="action-buttons">
      <Button onclick={() => save()} disabled={busy} title="Save config" aria-label="Save config">
        <SaveIcon />
        {action === "save" ? "Saving..." : "Save"}
      </Button>
      <Button variant="outline" onclick={() => save(true)} disabled={busy}>
        {action === "save-restart" ? "Restarting..." : "Save & restart"}
      </Button>
    </div>
  </div>
  {#if message}
    <div class="message" class:error>{message}</div>
  {/if}
  {#if loaded}
    {#if supportsUi && mode === 'ui'}
      <div class="ui-content">
        {#if component === 'nullclaw'}
          <ConfigEditorUI bind:config={configObj} onchange={onUiChange} />
        {:else}
          <StructuredConfigEditor {component} bind:config={configObj} onchange={onUiChange} />
        {/if}
      </div>
    {:else}
      <textarea class="raw-editor" bind:value={configText} spellcheck="false"></textarea>
    {/if}
  {/if}
</div>

<style>
  .config-editor {
    display: flex;
    flex-direction: column;
  }
  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    margin-bottom: 0.5rem;
    gap: 1rem;
  }
  .mode-toggle {
    display: flex;
    gap: 0;
  }
  .action-buttons {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .mode-btn {
    padding: 0.5rem 1rem;
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-background);
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .mode-btn:first-child {
    border-radius: var(--shadcn-radius) 0 0 var(--shadcn-radius);
  }
  .mode-btn:last-child {
    border-radius: 0 var(--shadcn-radius) var(--shadcn-radius) 0;
    border-left: none;
  }
  .mode-btn:hover {
    background: var(--shadcn-accent);
    color: var(--shadcn-foreground);
  }
  .mode-btn.active {
    background: var(--shadcn-foreground);
    border-color: var(--shadcn-foreground);
    color: var(--shadcn-background);
  }
  .ui-content {
    max-height: 600px;
    overflow-y: auto;
    padding-right: 0.25rem;
  }
  .ui-content::-webkit-scrollbar {
    width: 6px;
  }
  .ui-content::-webkit-scrollbar-track {
    background: transparent;
  }
  .ui-content::-webkit-scrollbar-thumb {
    background: var(--shadcn-border);
    border-radius: 3px;
  }
  .ui-content::-webkit-scrollbar-thumb:hover {
    background: var(--shadcn-muted-foreground);
  }
  .raw-editor {
    flex: 1;
    min-height: 400px;
    background: var(--shadcn-muted);
    color: var(--shadcn-foreground);
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 1rem;
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.875rem;
    resize: none;
    line-height: 1.6;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .raw-editor:focus-visible {
    outline: none;
    border-color: var(--shadcn-ring);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--shadcn-ring) 50%, transparent);
  }
  .message {
    padding: 0.75rem 1rem;
    margin-bottom: 0.75rem;
    border-radius: var(--shadcn-radius);
    font-size: 0.8125rem;
    background: var(--shadcn-muted);
    color: var(--shadcn-foreground);
    border: 1px solid var(--shadcn-border);
  }
  .message.error {
    background: color-mix(in srgb, var(--shadcn-destructive) 6%, transparent);
    color: var(--shadcn-destructive);
    border-color: color-mix(in srgb, var(--shadcn-destructive) 30%, transparent);
  }
</style>
