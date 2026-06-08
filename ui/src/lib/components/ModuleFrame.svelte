<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { mount, unmount } from 'svelte';

  let { moduleName = '', moduleVersion = '', instanceUrl = '', token = '', moduleProps = {} } = $props<{
    moduleName?: string;
    moduleVersion?: string;
    instanceUrl?: string;
    token?: string;
    moduleProps?: Record<string, any>;
  }>();
  let container: HTMLElement;
  let mountedComponent: any = null;
  let error = $state('');

  function moduleBasePaths() {
    if (typeof window !== 'undefined') {
      const configured = (window as any).__NULLHUB_UI_BASE__;
      if (typeof configured === 'string' && configured.trim()) {
        return [configured.trim().replace(/\/$/, '')];
      }
    }
    return ['/nullhub-ui', '/ui'];
  }

  onMount(async () => {
    try {
      let mod: any = null;
      let lastError: unknown = null;
      for (const basePath of moduleBasePaths()) {
        const cacheKey = moduleVersion === 'dev-local' ? Date.now() : moduleVersion;
        const moduleUrl = `${basePath}/${moduleName}@${moduleVersion}/module.js?v=${encodeURIComponent(String(cacheKey))}`;
        try {
          mod = await import(/* @vite-ignore */ moduleUrl);
          break;
        } catch (e) {
          lastError = e;
        }
      }
      if (!mod) throw lastError || new Error('module not found');
      const opts = {
        instanceUrl,
        token,
        theme: 'dark',
        ...moduleProps
      };
      if (mod.create && container) {
        mountedComponent = mod.create(container, opts);
      } else if (mod.default && container) {
        mountedComponent = mount(mod.default, {
          target: container,
          props: opts
        });
      }
    } catch (e) {
      error = `Failed to load module: ${(e as Error).message}`;
    }
  });

  onDestroy(() => {
    if (mountedComponent) {
      if (mountedComponent.destroy && typeof mountedComponent.destroy === 'function') {
        try { mountedComponent.destroy(); } catch {}
      } else if (typeof unmount === 'function') {
        try { unmount(mountedComponent); } catch {}
      }
    }
  });
</script>

<div class="module-frame">
  {#if error}
    <div class="module-error">{error}</div>
  {/if}
  <div bind:this={container} class="module-container"></div>
</div>

<style>
  .module-frame { width: 100%; height: 100%; min-height: 400px; }
  .module-container { width: 100%; height: 100%; }
  .module-error { padding: 1rem; color: var(--error); background: color-mix(in srgb, var(--error) 10%, transparent); border-radius: var(--radius); margin-bottom: 1rem; font-size: 0.875rem; }
</style>
