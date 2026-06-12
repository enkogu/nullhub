<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Card } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Badge } from "$lib/components/ui/badge";
  import SaveIcon from "@lucide/svelte/icons/save";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  type ServiceInfo = {
    status: string;
    message: string;
    registered: boolean;
    running: boolean;
    service_type: string;
    unit_path: string;
  };

  let settings = $state<any>({
    port: 19800,
    host: "127.0.0.1",
    auth_token: null,
    auto_update_check: true,
    access: null,
  });
  let saving = $state(false);
  let serviceLoading = $state(false);
  let serviceAction = $state<"status" | "install" | "uninstall" | null>(null);
  let messageTone = $state<"success" | "error">("success");
  let message = $state("");
  let service = $state<ServiceInfo>({
    status: "ok",
    message: "",
    registered: false,
    running: false,
    service_type: "",
    unit_path: "",
  });

  const serviceButtonLabel = $derived.by(() => {
    if (serviceLoading) {
      if (serviceAction === "install") return "Enabling...";
      if (serviceAction === "uninstall") return "Disabling...";
      return "Checking...";
    }
    return service.registered ? "Disable Autostart" : "Enable Autostart";
  });

  onMount(async () => {
    try {
      settings = await api.getSettings();
    } catch (e) {
      console.error(e);
    }

    await refreshServiceStatus();
  });

  function setMessage(text: string, tone: "success" | "error" = "success") {
    message = text;
    messageTone = tone;
  }

  function applyServiceStatus(data: any) {
    service = {
      status: typeof data?.status === "string" ? data.status : "ok",
      message: typeof data?.message === "string" ? data.message : "",
      registered: !!data?.registered,
      running: !!data?.running,
      service_type: typeof data?.service_type === "string" ? data.service_type : "",
      unit_path: typeof data?.unit_path === "string" ? data.unit_path : "",
    };
  }

  async function refreshServiceStatus(showErrorMessage = true) {
    serviceLoading = true;
    serviceAction = "status";
    try {
      const data = await api.serviceStatus();
      applyServiceStatus(data);
      if (data?.status === "error" && showErrorMessage) {
        setMessage(data?.message || "Failed to load service status", "error");
      }
    } catch (e) {
      applyServiceStatus({
        status: "error",
        message: (e as Error).message || "Failed to load service status",
      });
      if (showErrorMessage) {
        setMessage(`Error: ${(e as Error).message}`, "error");
      }
    } finally {
      serviceLoading = false;
      serviceAction = null;
    }
  }

  async function toggleService() {
    const enabling = !service.registered;
    serviceLoading = true;
    serviceAction = enabling ? "install" : "uninstall";
    try {
      const data = enabling ? await api.serviceInstall() : await api.serviceUninstall();
      applyServiceStatus(data);
      if (data?.status === "error") {
        setMessage(data?.message || "Failed to update service", "error");
        return;
      }

      await refreshServiceStatus(false);
      setMessage(data?.message || (enabling ? "Service enabled" : "Service disabled"));
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`, "error");
    } finally {
      serviceLoading = false;
      serviceAction = null;
    }
  }

  async function save() {
    saving = true;
    try {
      const { access, ...payload } = settings;
      await api.putSettings(payload);
      setMessage("Settings saved");
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`, "error");
    } finally {
      saving = false;
    }
  }
</script>

<div class="settings-page">
  <PageHeader title="Settings" subtitle="Configure how NullHub runs on this machine.">
    {#snippet actions()}
      <Button onclick={save} disabled={saving}>
        <SaveIcon size={15} />
        {saving ? "Saving..." : "Save"}
      </Button>
    {/snippet}
  </PageHeader>

  {#if message}
    <div class="banner" class:banner-error={messageTone === "error"}>{message}</div>
  {/if}

  <Card class="px-5">
    <div class="section-head">
      <h2>Server</h2>
      <p>The address NullHub binds to for serving the dashboard and API.</p>
    </div>
    <div class="fields">
      <div class="field">
        <Label for="settings-port">Port</Label>
        <Input id="settings-port" type="number" bind:value={settings.port} />
      </div>
      <div class="field">
        <Label for="settings-host">Host</Label>
        <Input id="settings-host" type="text" bind:value={settings.host} />
      </div>
    </div>
  </Card>

  <Card class="px-5">
    <div class="section-head">
      <h2>Security</h2>
      <p>Set a token to require authentication for remote access.</p>
    </div>
    <div class="fields">
      <div class="field">
        <Label for="settings-auth-token">Auth token</Label>
        <Input
          id="settings-auth-token"
          type="password"
          bind:value={settings.auth_token}
          placeholder="Leave empty to disable"
        />
        <p class="hint">Set a token to enable remote access authentication.</p>
      </div>
    </div>
  </Card>

  <Card class="px-5">
    <div class="section-head">
      <h2>Updates</h2>
      <p>Control automatic update notifications.</p>
    </div>
    <div class="switch-row">
      <div class="switch-text">
        <Label for="settings-auto-update">Auto-check for updates</Label>
        <p class="hint">Periodically check whether a newer version is available.</p>
      </div>
      <Switch id="settings-auto-update" bind:checked={settings.auto_update_check} />
    </div>
  </Card>

  <Card class="px-5">
    <div class="section-head">
      <h2>Service</h2>
      <p>Register NullHub as a system service for automatic startup.</p>
    </div>
    <div class="status-grid">
      <div class="status-row">
        <span class="status-label">Autostart</span>
        <Badge variant={service.registered ? "success" : "muted"}>
          {service.registered ? "Enabled" : "Disabled"}
        </Badge>
      </div>
      <div class="status-row">
        <span class="status-label">Runtime</span>
        <Badge variant={service.running ? "success" : "muted"}>
          {service.running ? "Running" : "Stopped"}
        </Badge>
      </div>
      {#if service.service_type}
        <div class="status-row">
          <span class="status-label">Service type</span>
          <code>{service.service_type}</code>
        </div>
      {/if}
      {#if service.unit_path}
        <div class="status-row">
          <span class="status-label">Unit path</span>
          <code>{service.unit_path}</code>
        </div>
      {/if}
    </div>
    <div class="service-actions">
      <Button variant="default" disabled={serviceLoading} onclick={toggleService}>
        {serviceButtonLabel}
      </Button>
      <Button variant="outline" disabled={serviceLoading} onclick={() => refreshServiceStatus()}>
        <RefreshCwIcon size={15} />
        Refresh status
      </Button>
    </div>
  </Card>
</div>

<style>
  .settings-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .section-head h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--shadcn-foreground);
  }

  .section-head p {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
    color: var(--shadcn-muted-foreground);
    line-height: 1.4;
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

  .hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--shadcn-muted-foreground);
    line-height: 1.5;
  }

  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .switch-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .status-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
  }

  .status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .status-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--shadcn-muted-foreground);
  }

  .status-row code {
    max-width: 28rem;
    text-align: right;
    word-break: break-all;
    font-size: 0.8125rem;
    color: var(--shadcn-foreground);
  }

  .service-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .banner {
    padding: 0.75rem 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
    font-size: 0.875rem;
    color: var(--shadcn-foreground);
  }

  .banner-error {
    border-color: var(--shadcn-destructive);
    color: var(--shadcn-destructive);
    background: color-mix(in srgb, var(--shadcn-destructive) 8%, transparent);
  }

  @media (max-width: 640px) {
    .settings-page {
      padding: 1.25rem;
    }

    .status-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .status-row code {
      text-align: left;
    }
  }
</style>
