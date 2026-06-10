<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { pollWhileVisible } from "$lib/poll";
  import LogViewer from "$lib/components/LogViewer.svelte";
  import ConfigEditor from "$lib/components/ConfigEditor.svelte";
  import NullClawChatSurface from "$lib/components/NullClawChatSurface.svelte";
  import InstanceHistoryPanel from "$lib/components/InstanceHistoryPanel.svelte";
  import InstanceHooksPanel from "$lib/components/InstanceHooksPanel.svelte";
  import InstanceMemoryPanel from "$lib/components/InstanceMemoryPanel.svelte";
  import InstanceMcpPanel from "$lib/components/InstanceMcpPanel.svelte";
  import InstanceSkillsPanel from "$lib/components/InstanceSkillsPanel.svelte";
  import InstanceCronPanel from "$lib/components/InstanceCronPanel.svelte";
  import MarkdownManagerPanel from "$lib/components/MarkdownManagerPanel.svelte";
  import NullBoilerPanel from "$lib/components/NullBoilerPanel.svelte";
  import NullTicketsPanel from "$lib/components/NullTicketsPanel.svelte";
  import { api, type ApiRequestError } from "$lib/api/client";
  import { nullboilerUiRoutes, withBoilerInstance } from "$lib/nullboiler/routes";
  import { nullticketsUiRoutes, withTicketsInstance } from "$lib/nulltickets/routes";
  import {
    getSelectedBoilerInstance,
    getSelectedTicketsInstance,
    setSelectedBoilerInstance,
    setSelectedTicketsInstance,
  } from "$lib/nullstack/backendSelection";
  import { instanceRoute } from "$lib/nullstack/path";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Tabs, TabsList, TabsTrigger } from "$lib/components/ui/tabs";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Select } from "$lib/components/ui/select";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Label } from "$lib/components/ui/label";
  import { Switch } from "$lib/components/ui/switch";
  import { Badge, type BadgeVariant } from "$lib/components/ui/badge";
  import PlayIcon from "@lucide/svelte/icons/play";
  import SquareIcon from "@lucide/svelte/icons/square";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import BotIcon from "@lucide/svelte/icons/bot";
  import RadioIcon from "@lucide/svelte/icons/radio";

  let component = $derived($page.params.component ?? "");
  let name = $derived($page.params.name ?? "");
  let instance = $state<any>(null);
  let config = $state<any>(null);
  let activeTab = $state("overview");
  let bootstrapChatAutoOpenedFor = $state("");
  let bootstrapNoticeHidden = $state(false);
  let loading = $state(false);
  let providerHealth = $state<any>(null);
  let providerHealthLoading = $state(false);
  let onboardingStatus = $state<any>(null);
  let lastUsageRefreshAt = $state(0);
  type UsageWindow = "24h" | "7d" | "30d" | "all";
  let usageWindow = $state<UsageWindow>("24h");
  let usageData = $state<any>(null);
  let usageLoading = $state(false);
  let standaloneCopyState = $state<"idle" | "copied" | "error">("idle");
  let standaloneCopyTimer: ReturnType<typeof setTimeout> | null = null;
  let integration = $state<any>(null);
  let integrationLoading = $state(false);
  let integrationError = $state<string | null>(null);
  let linkingIntegration = $state(false);
  let selectedWatch = $state("");
  let selectedClaw = $state("");
  let selectedTracker = $state("");
  let selectedPipeline = $state("");
  let trackerClaimRole = $state("coder");
  let trackerSuccessTrigger = $state("complete");
  let trackerConcurrency = $state("1");
  let ticketsPipelines = $state([] as any[]);
  let ticketsTasks = $state([] as any[]);
  let ticketsDataLoading = $state(false);
  let ticketsDataError = $state("");
  let ticketsActionMessage = $state("");
  let ticketsActionError = $state("");
  let ticketTaskPipeline = $state("");
  let ticketTaskTitle = $state("");
  let ticketTaskDescription = $state("");
  let ticketTaskPriority = $state("0");
  let ticketClaimAgent = $state("nullhub");
  let ticketClaimRole = $state("coder");
  let ticketClaimTtl = $state("300000");
  let claimedTicket = $state<any>(null);
  let lastTicketsRefreshAt = $state(0);
  let refreshInFlight = false;
  let refreshQueued = false;
  let refreshRequestSeq = 0;
  let integrationRequestSeq = 0;
  let lastIntegrationRefreshAt = 0;

  let modelName = $derived(extractModel(config));
  let webPort = $derived(extractWebPort(config));
  let providerStatus = $derived(extractProviderStatus(config));
  let providerHealthCurrent = $derived(
    providerHealth &&
      providerHealth.provider === providerStatus.provider &&
      providerHealth.model === providerStatus.model
      ? providerHealth
      : null,
  );
  let providerDotOk = $derived(
    Boolean(providerStatus.provider) &&
      (providerHealthCurrent ? Boolean(providerHealthCurrent.live_ok) : providerStatus.configured),
  );
  let providerCardWarn = $derived(
    instance?.status === "running"
      ? (providerHealthCurrent ? !providerDotOk : !providerStatus.configured)
      : !providerStatus.configured,
  );
  let providerHintText = $derived(
    buildProviderHint(
      providerStatus,
      // Only surface live-probe errors when the instance is actually running —
      // otherwise the result is stale/irrelevant (probe ran while starting).
      instance?.status === "running" ? providerHealthCurrent : null,
      providerHealthLoading,
    ),
  );
  let chatReady = $derived(
    instance?.status === "running" &&
      providerStatus.configured,
  );
  let onboardingPending = $derived(
    Boolean(onboardingStatus?.supported && onboardingStatus?.pending),
  );
  let onboardingStarterMessage = $derived(
    typeof onboardingStatus?.starter_message === "string" &&
      onboardingStatus.starter_message.length > 0
      ? onboardingStatus.starter_message
      : "Wake up, my friend!",
  );
  let onboardingMarker = $derived(
    typeof onboardingStatus?.bootstrap_seeded_at === "string" &&
      onboardingStatus.bootstrap_seeded_at.length > 0
      ? onboardingStatus.bootstrap_seeded_at
      : "",
  );
  let supportsIntegration = $derived(
    component === "nullclaw" ||
      component === "nullwatch" ||
      component === "nullboiler" ||
      component === "nulltickets",
  );
  let supportsAgentData = $derived(component === "nullclaw");
  let supportsBoilerUi = $derived(component === "nullboiler");
  let supportsTicketsUi = $derived(component === "nulltickets");
  let supportsChat = $derived(component === "nullclaw");
  let supportsCron = $derived(component === "nullclaw");
  let supportsHooks = $derived(component === "nullclaw");
  let supportsUsage = $derived(component === "nullclaw");
  let supportsVerboseStartup = $derived(component === "nullclaw");
  let instanceKind = $derived(component === "nullclaw" ? "Agent" : component);
  let instanceRouteKey = $derived(`${component}/${name}`);
  const statusVariants: Record<string, BadgeVariant> = {
    running: "success",
    starting: "warning",
    restarting: "warning",
    stopping: "warning",
    stopped: "muted",
    failed: "destructive",
  };
  let statusValue = $derived(instance?.status || "stopped");
  let statusVariant = $derived(statusVariants[statusValue] || "muted");
  let headerSubtitle = $derived(
    [instanceKind, instance?.version, instance?.port ? `port ${instance.port}` : ""]
      .filter(Boolean)
      .join(" · "),
  );
  const routeTabs = new Set([
    "overview",
    "chat",
    "history",
    "memory",
    "skills",
    "mcp",
    "hooks",
    "cron",
    "docs",
    "tickets",
    "boiler",
    "config",
    "logs",
    "advanced",
  ]);
  let initializedRouteKey = $state("");
  let queueSummary = $derived(summarizeQueue(integration?.queue));
  let linkedBoilers = $derived(integration?.linked_boilers || []);
  let trackerOptions = $derived(integration?.available_trackers || []);
  let watchOptions = $derived(integration?.available_watches || []);
  let linkedWatch = $derived(integration?.linked_watch || null);
  let currentTelemetryLink = $derived(integration?.current_link || null);
  let clawOptions = $derived(integration?.available_claws || []);
  let linkedClaws = $derived(clawOptions.filter((claw: any) => claw?.linked));
  let selectedTrackerOption = $derived(
    trackerOptions.find((tracker: any) => tracker?.name === selectedTracker) || null,
  );
  let selectedTrackerPipelines = $derived(
    Array.isArray(selectedTrackerOption?.pipelines) ? selectedTrackerOption.pipelines : [],
  );
  let selectedPipelineOption = $derived(
    selectedTrackerPipelines.find((pipeline: any) => pipeline?.id === selectedPipeline) || null,
  );
  let selectedPipelineRoles = $derived(
    Array.isArray(selectedPipelineOption?.roles) ? selectedPipelineOption.roles : [],
  );
  let selectedPipelineTriggers = $derived(
    Array.isArray(selectedPipelineOption?.triggers) ? selectedPipelineOption.triggers : [],
  );
  let standaloneHomeEnv = $derived(componentHomeEnv(component));
  let standaloneHomePath = $derived(`$NULLHUB_HOME/instances/${component}/${name}`);
  let standaloneConfigPath = $derived(`${standaloneHomePath}/config.json`);
  let hasStandaloneBinary = $derived(Boolean(instance?.version && instance.version !== "standalone"));
  let standaloneBinaryName = $derived(
    hasStandaloneBinary ? managedBinaryName(component, instance.version) : "",
  );
  let standaloneBinaryPath = $derived(
    standaloneBinaryName ? `$NULLHUB_HOME/bin/${standaloneBinaryName}` : "",
  );
  let standaloneLaunchScript = $derived(
    hasStandaloneBinary
      ? buildStandaloneLaunchScript(
          component,
          name,
          instance?.version,
          instance?.launch_mode,
          instance?.verbose,
          standaloneHomeEnv,
        )
      : "",
  );

  function hashTab(): string {
    const value = window.location.hash.replace(/^#/, "");
    return routeTabs.has(value) ? value : "";
  }

  function syncTabHash(tab: string) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.hash = tab;
    window.history.replaceState(null, "", url);
  }

  function extractModel(cfg: any): string | null {
    if (!cfg) return null;
    try {
      if (cfg.channels?.gateway?.model) return cfg.channels.gateway.model;
      if (cfg.model) return cfg.model;
      if (cfg.channels?.web?.model) return cfg.channels.web.model;
    } catch {
      /* ignore */
    }
    return null;
  }

  function isLocalEndpoint(url: string): boolean {
    return (
      url.startsWith("http://localhost") ||
      url.startsWith("https://localhost") ||
      url.startsWith("http://127.") ||
      url.startsWith("https://127.") ||
      url.startsWith("http://0.0.0.0") ||
      url.startsWith("https://0.0.0.0") ||
      url.startsWith("http://[::1]") ||
      url.startsWith("https://[::1]")
    );
  }

  function knownCompatibleProviderUrl(provider: string): string | null {
    if (provider === "lmstudio" || provider === "lm-studio") return "http://localhost:1234/v1";
    if (provider === "vllm") return "http://localhost:8000/v1";
    if (provider === "llamacpp" || provider === "llama.cpp") return "http://localhost:8080/v1";
    if (provider === "sglang") return "http://localhost:30000/v1";
    if (provider === "osaurus") return "http://localhost:1337/v1";
    if (provider === "litellm") return "http://localhost:4000";
    return null;
  }

  function providerRequiresApiKey(provider: string, providerEntry: any): boolean {
    if (
      provider === "ollama" ||
      provider === "claude-cli" ||
      provider === "codex-cli" ||
      provider === "openai-codex"
    ) {
      return false;
    }

    const configuredBaseUrl = providerEntry?.base_url || providerEntry?.api_url || "";
    if (configuredBaseUrl) return !isLocalEndpoint(configuredBaseUrl);

    if (provider.startsWith("custom:")) return !isLocalEndpoint(provider.slice("custom:".length));

    const knownUrl = knownCompatibleProviderUrl(provider);
    if (knownUrl) return !isLocalEndpoint(knownUrl);

    return true;
  }

  function extractProviderStatus(cfg: any): {
    provider: string;
    model: string;
    configured: boolean;
  } {
    const none = { provider: "", model: "", configured: false };
    if (!cfg) return none;
    try {
      const primary = cfg.agents?.defaults?.model?.primary || "";
      if (!primary) return none;
      const parts = primary.split("/");
      const provider = parts.length > 1 ? parts[0] : primary;
      const model = parts.length > 1 ? parts.slice(1).join("/") : primary;
      const providers = cfg.models?.providers || {};
      const providerEntry = providers[provider] || {};
      const hasApiKey = Boolean(providerEntry?.api_key);
      const configured = !providerRequiresApiKey(provider, providerEntry) || hasApiKey;
      return { provider, model, configured };
    } catch {
      return none;
    }
  }

  function extractWebPort(cfg: any): number | null {
    if (!cfg) return null;
    try {
      if (cfg.channels?.web?.accounts?.default?.port)
        return cfg.channels.web.accounts.default.port;
      if (cfg.channels?.web?.port) return cfg.channels.web.port;
      if (cfg.web_port) return cfg.web_port;
    } catch {
      /* ignore */
    }
    return null;
  }

  function formatUptime(seconds: number | undefined): string {
    if (!seconds && seconds !== 0) return "-";
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m ${seconds % 60}s`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }

  function formatTokens(value: number | undefined): string {
    const v = value ?? 0;
    return v.toLocaleString();
  }

  function formatLastUsed(ts: number | undefined): string {
    if (!ts) return "-";
    try {
      return new Date(ts * 1000).toLocaleString();
    } catch {
      return "-";
    }
  }

  function setStandaloneCopyState(state: "idle" | "copied" | "error") {
    standaloneCopyState = state;
    if (standaloneCopyTimer) clearTimeout(standaloneCopyTimer);
    if (state !== "idle") {
      standaloneCopyTimer = setTimeout(() => {
        standaloneCopyState = "idle";
        standaloneCopyTimer = null;
      }, 1600);
    } else {
      standaloneCopyTimer = null;
    }
  }

  function componentHomeEnv(componentName: string): string {
    if (componentName === "nullclaw") return "NULLCLAW_HOME";
    if (componentName === "nullboiler") return "NULLBOILER_HOME";
    if (componentName === "nulltickets") return "NULLTICKETS_HOME";
    if (componentName === "nullwatch") return "NULLWATCH_HOME";
    return "COMPONENT_HOME";
  }

  function componentPortLabel(componentName: string): string {
    if (componentName === "nullclaw") return "Gateway";
    return "API";
  }

  function formatLaunchMode(launchMode: string | undefined): string {
    const mode = launchMode || (component === "nullclaw" ? "gateway" : "server");
    if (mode === "agent") return "Agent";
    if (mode === "gateway") return "Gateway";
    if (mode === "server" || mode === "serve") return "Server";
    return mode;
  }

  function shellQuote(value: string): string {
    if (value === "") return "''";
    return `'${value.replaceAll("'", `'\"'\"'`)}'`;
  }

  function tokenizeLaunchMode(launchMode: string): string[] {
    if (launchMode === "server") return [];
    return launchMode
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function defaultLaunchMode(componentName: string): string {
    if (componentName === "nullboiler" || componentName === "nulltickets") return "server";
    if (componentName === "nullwatch") return "serve";
    return "gateway";
  }

  function managedBinaryName(componentName: string, version: string | undefined): string {
    if (!version) return "";
    if (version === "dev-local") return componentName;
    return `${componentName}-${version}`;
  }

  function normalizedLaunchArgs(componentName: string, launchMode: string | undefined): string[] {
    const args = tokenizeLaunchMode(launchMode || defaultLaunchMode(componentName));
    const fallback = defaultLaunchMode(componentName);
    if (args.length === 0 && fallback !== "server") args.push(fallback);
    if (componentName === "nullwatch" && args[0] === "nullwatch") {
      args[0] = "serve";
    }
    return args;
  }

  function displayLaunchMode(launchMode: string | undefined): string {
    const tokens = normalizedLaunchArgs(component, launchMode);
    const primary = tokens[0] || defaultLaunchMode(component);
    if (primary === "agent") return "Agent";
    if (primary === "gateway") return "Gateway";
    if (primary === "serve") return "Serve";
    if (primary === "server") return "Server";
    return primary;
  }

  function buildStandaloneLaunchScript(
    componentName: string,
    instanceName: string,
    version: string | undefined,
    launchMode: string | undefined,
    verbose: boolean | undefined,
    homeEnv: string,
  ): string {
    if (!version) return "";

    const args = normalizedLaunchArgs(componentName, launchMode);
    if (verbose) args.push("--verbose");

    const command = [
      `"$NULLHUB_HOME/bin/${managedBinaryName(componentName, version)}"`,
      ...args.map(shellQuote),
    ].join(" ");

    return [
      'export NULLHUB_HOME="${NULLHUB_HOME:-$HOME/.nullhub}"',
      `export ${homeEnv}="$NULLHUB_HOME/instances/${componentName}/${instanceName}"`,
      command,
    ].join("\n");
  }

  async function copyStandaloneLaunchScript() {
    if (!standaloneLaunchScript) return;
    try {
      await navigator.clipboard.writeText(standaloneLaunchScript);
      setStandaloneCopyState("copied");
    } catch {
      setStandaloneCopyState("error");
    }
  }

  function handleStandaloneLaunchKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void copyStandaloneLaunchScript();
    }
  }

  function buildProviderHint(
    status: { provider: string; configured: boolean },
    probe: any,
    probeLoading: boolean,
  ): string {
    if (!status.provider) return "";
    if (probeLoading) return "Checking live auth...";
    if (!probe) return "";
    if (probe.live_ok) {
      return "";
    }
    const code = probe.status_code ? ` (HTTP ${probe.status_code})` : "";
    switch (probe.reason) {
      case "invalid_api_key":
        return "Invalid API key (401)";
      case "missing_api_key":
        return "No API key";
      case "instance_not_running":
        return "Instance is not running";
      case "rate_limited":
        return "Rate limited (429)";
      case "forbidden":
        return "Forbidden (403)";
      case "provider_unavailable":
        return `Provider unavailable${code}`;
      case "network_error":
        return "Network error during auth check";
      case "provider_rejected":
        return "Provider rejected probe (check credentials/model)";
      case "probe_exec_failed":
      case "probe_request_failed":
        return "Probe request failed";
      case "config_load_failed":
        return "Probe could not load config";
      case "component_binary_missing":
        return "Component binary missing for probe";
      case "probe_home_path_failed":
        return "Probe home path failed";
      case "invalid_probe_response":
        return "Probe returned invalid response";
      default:
        return `Auth check failed${code}`;
    }
  }

  function summarizeQueue(queue: any): {
    roles: any[];
    claimable: number;
    failed: number;
    stuck: number;
    nearExpiry: number;
  } {
    const roles = Array.isArray(queue?.roles) ? queue.roles : [];
    let claimable = 0;
    let failed = 0;
    let stuck = 0;
    let nearExpiry = 0;
    for (const role of roles) {
      claimable += Number(role?.claimable_count || 0);
      failed += Number(role?.failed_count || 0);
      stuck += Number(role?.stuck_count || 0);
      nearExpiry += Number(role?.near_expiry_leases || 0);
    }
    return { roles, claimable, failed, stuck, nearExpiry };
  }

  function normalizeCollectionResult(result: any): any[] {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.items)) return result.items;
    if (Array.isArray(result?.tasks)) return result.tasks;
    if (Array.isArray(result?.pipelines)) return result.pipelines;
    return [];
  }

  function pipelineId(pipeline: any): string {
    return String(pipeline?.id || pipeline?.name || "");
  }

  function pipelineName(pipeline: any): string {
    return String(pipeline?.name || pipeline?.id || "pipeline");
  }

  function taskTitle(task: any): string {
    return String(task?.title || task?.id || "task");
  }

  function firstQueueRole(): string {
    const role = queueSummary.roles.find((item: any) => Number(item?.claimable_count || 0) > 0)?.role ||
      queueSummary.roles[0]?.role;
    return typeof role === "string" && role.length > 0 ? role : "coder";
  }

  async function refreshTicketsData(force = false) {
    if (component !== "nulltickets") return;
    if (integration?.instance?.running !== true && instance?.status !== "running") {
      ticketsPipelines = [];
      ticketsTasks = [];
      ticketsDataError = "";
      return;
    }

    const now = Date.now();
    if (!force && now - lastTicketsRefreshAt < 5_000) return;
    lastTicketsRefreshAt = now;
    ticketsDataLoading = true;
    try {
      const [pipelinesResult, tasksResult] = await Promise.all([
        api.nullTicketsPipelines(component, name),
        api.nullTicketsTasks(component, name, { limit: 8 }),
      ]);
      ticketsPipelines = normalizeCollectionResult(pipelinesResult);
      ticketsTasks = normalizeCollectionResult(tasksResult);
      if (!ticketTaskPipeline || !ticketsPipelines.some((pipeline) => pipelineId(pipeline) === ticketTaskPipeline)) {
        ticketTaskPipeline = pipelineId(ticketsPipelines[0] || {});
      }
      if (!ticketClaimRole) ticketClaimRole = firstQueueRole();
      ticketsDataError = "";
    } catch (e) {
      ticketsDataError = (e as Error).message;
    } finally {
      ticketsDataLoading = false;
    }
  }

  async function refreshIntegration(force = false) {
    if (!supportsIntegration) {
      integration = null;
      integrationError = null;
      return;
    }
    const now = Date.now();
    if (!force && now - lastIntegrationRefreshAt < 10_000) return;
    if (integrationLoading) return;
    lastIntegrationRefreshAt = now;

    const req = ++integrationRequestSeq;
    integrationLoading = true;
    try {
      const nextIntegration = await api.getIntegration(component, name);
      if (req !== integrationRequestSeq) return;
      integration = nextIntegration;
      integrationError = null;
      if (component === "nullboiler") {
        const currentLink = integration?.current_link;
        const availableTrackers = Array.isArray(integration?.available_trackers)
          ? integration.available_trackers
          : [];
        const selectedStillAvailable = availableTrackers.some(
          (tracker: any) => tracker?.name === selectedTracker,
        );
        selectedTracker =
          integration?.linked_tracker?.name ||
          (selectedStillAvailable ? selectedTracker : availableTrackers[0]?.name) ||
          "";
        selectedPipeline =
          currentLink?.pipeline_id || (selectedStillAvailable ? selectedPipeline : "") || "";
        trackerClaimRole = currentLink?.claim_role || trackerClaimRole || "coder";
        trackerSuccessTrigger =
          currentLink?.success_trigger || trackerSuccessTrigger || "complete";
        trackerConcurrency =
          String(currentLink?.max_concurrent_tasks || trackerConcurrency || "1");
      } else if (component === "nulltickets") {
        if (!ticketClaimRole) ticketClaimRole = firstQueueRole();
        void refreshTicketsData(force);
      } else if (component === "nullclaw") {
        selectedWatch =
          integration?.linked_watch?.name ||
          selectedWatch ||
          integration?.available_watches?.[0]?.name ||
          "";
      } else if (component === "nullwatch") {
        const unlinked = integration?.available_claws?.find((claw: any) => !claw?.linked);
        selectedClaw =
          selectedClaw ||
          unlinked?.name ||
          integration?.available_claws?.[0]?.name ||
          "";
      }
    } catch (e) {
      if (req !== integrationRequestSeq) return;
      integration = null;
      integrationError = (e as Error).message;
    } finally {
      if (req === integrationRequestSeq) integrationLoading = false;
    }
  }

  async function linkTracker() {
    if (component !== "nullboiler" || !selectedTracker || !selectedPipeline.trim()) return;

    linkingIntegration = true;
    try {
      const payload: Record<string, any> = {
        tracker_instance: selectedTracker,
        pipeline_id: selectedPipeline.trim(),
        claim_role: trackerClaimRole || "coder",
        success_trigger: trackerSuccessTrigger.trim() || "complete",
        max_concurrent_tasks: Math.max(1, Number(trackerConcurrency || "1") || 1),
      };
      await api.linkIntegration(component, name, payload);
      await refresh();
      integrationError = null;
    } catch (e) {
      integrationError = (e as Error).message;
    } finally {
      linkingIntegration = false;
    }
  }

  async function openBoilerRoute(route: string) {
    if (component !== "nullboiler") return;
    setSelectedBoilerInstance(name);
    await goto(withBoilerInstance(route, name));
  }

  async function openTicketsStore() {
    if (component !== "nulltickets") return;
    setSelectedTicketsInstance(name);
    await goto(withTicketsInstance(nullticketsUiRoutes.store(), name));
  }

  async function createTicketTask() {
    if (component !== "nulltickets") return;
    const pipeline_id = ticketTaskPipeline.trim();
    const title = ticketTaskTitle.trim();
    if (!pipeline_id || !title) return;

    ticketsDataLoading = true;
    ticketsActionError = "";
    ticketsActionMessage = "";
    try {
      const priority = Number.parseInt(ticketTaskPriority || "0", 10);
      const result = await api.nullTicketsCreateTask(component, name, {
        pipeline_id,
        title,
        description: ticketTaskDescription.trim(),
        priority: Number.isFinite(priority) ? priority : 0,
        metadata: { source: "nullhub-ui" },
        assigned_by: "nullhub",
      });
      ticketTaskTitle = "";
      ticketTaskDescription = "";
      claimedTicket = null;
      ticketsActionMessage = `Task ${result?.id || ""} created`.trim();
      await refreshIntegration();
      await refreshTicketsData(true);
    } catch (e) {
      ticketsActionError = (e as Error).message;
    } finally {
      ticketsDataLoading = false;
    }
  }

  async function claimTicketTask() {
    if (component !== "nulltickets") return;
    const agent_id = ticketClaimAgent.trim() || "nullhub";
    const agent_role = ticketClaimRole.trim() || "coder";
    const lease_ttl_ms = Math.max(1000, Number.parseInt(ticketClaimTtl || "300000", 10) || 300000);

    ticketsDataLoading = true;
    ticketsActionError = "";
    ticketsActionMessage = "";
    try {
      const result = await api.nullTicketsClaimTask(component, name, {
        agent_id,
        agent_role,
        lease_ttl_ms,
      });
      if (result?.task) {
        claimedTicket = result;
        ticketsActionMessage = `Claimed ${result.task.id || "task"}`;
      } else {
        claimedTicket = null;
        ticketsActionMessage = "No claimable task";
      }
      await refreshIntegration();
      await refreshTicketsData(true);
    } catch (e) {
      ticketsActionError = (e as Error).message;
    } finally {
      ticketsDataLoading = false;
    }
  }

  async function linkNullWatch() {
    if (component !== "nullclaw" || !selectedWatch) return;

    linkingIntegration = true;
    try {
      await api.linkIntegration(component, name, { watch_instance: selectedWatch });
      await refresh();
    } finally {
      linkingIntegration = false;
    }
  }

  async function linkNullClawToWatch() {
    if (component !== "nullwatch" || !selectedClaw) return;

    linkingIntegration = true;
    try {
      await api.linkIntegration(component, name, { claw_instance: selectedClaw });
      await refresh();
    } finally {
      linkingIntegration = false;
    }
  }

  async function refreshProviderHealth(cfgOverride: any = config) {
    const status = extractProviderStatus(cfgOverride);
    if (!status.provider) {
      providerHealthLoading = false;
      providerHealth = null;
      return;
    }

    providerHealthLoading = true;
    try {
      providerHealth = await api.getProviderHealth(component, name);
    } catch {
      providerHealth = {
        provider: status.provider,
        configured: status.configured,
        running: instance?.status === "running",
        live_ok: false,
        status: "error",
        reason: "probe_request_failed",
      };
    } finally {
      providerHealthLoading = false;
    }
  }

  async function refreshUsage(force = false) {
    if (!supportsUsage) {
      usageData = null;
      usageLoading = false;
      return;
    }
    const now = Date.now();
    if (!force && now - lastUsageRefreshAt < 15_000) return;
    lastUsageRefreshAt = now;
    usageLoading = true;
    try {
      usageData = await api.getUsage(component, name, usageWindow);
    } catch {
      usageData = {
        window: usageWindow,
        rows: [],
        totals: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          requests: 0,
        },
      };
    } finally {
      usageLoading = false;
    }
  }

  async function refresh(loadProviderHealth = false, forceUsage = false) {
    if (refreshInFlight) {
      refreshQueued = true;
      return;
    }
    refreshInFlight = true;
    const req = ++refreshRequestSeq;
    const prevStatus = instance?.status;
    try {
      const status = await api.getStatus().catch(() => null);
      if (req !== refreshRequestSeq) return;
      const instances = status?.instances || {};
      if (instances[component] && instances[component][name]) {
        instance = instances[component][name];
      }

      // Re-fetch provider health when the instance just became running (stale probe from boot)
      const justBecameRunning = instance?.status === "running" && prevStatus !== "running";

      // Config and onboarding are useful for rendering controls, but they should not wait for
      // provider probes, usage summaries, or integration/tickets data.
      const configPromise = api.getConfig(component, name).catch(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
        return api.getConfig(component, name).catch(() => config);
      });
      const onboardingPromise = component === "nullclaw"
        ? api.getOnboarding(component, name).catch(() => null)
        : Promise.resolve(null);
      const [loadedConfig, nextOnboardingStatus] = await Promise.all([configPromise, onboardingPromise]);
      if (req !== refreshRequestSeq) return;
      if (loadedConfig) config = loadedConfig;
      if (!loadedConfig && !config) providerHealth = null;
      onboardingStatus = nextOnboardingStatus;

      if (loadProviderHealth || justBecameRunning) {
        void refreshProviderHealth(loadedConfig || config);
      }
      void refreshUsage(forceUsage);
      void refreshIntegration(loadProviderHealth || forceUsage);
    } finally {
      refreshInFlight = false;
      if (refreshQueued) {
        refreshQueued = false;
        void refresh(false, false);
      }
    }
  }

  $effect(() => {
    usageWindow;
    if (!supportsUsage) return;
    if (!component || !name) return;
    void refreshUsage(true);
  });

  $effect(() => {
    if (component !== "nullboiler" || !selectedTracker) return;
    if (selectedTrackerPipelines.length === 0) return;
    if (!selectedPipeline || !selectedTrackerPipelines.some((pipeline: any) => pipeline?.id === selectedPipeline)) {
      selectedPipeline = selectedTrackerPipelines[0]?.id || "";
    }
  });

  $effect(() => {
    if (component !== "nullboiler") return;
    if (selectedPipelineRoles.length > 0 && !selectedPipelineRoles.includes(trackerClaimRole)) {
      trackerClaimRole = selectedPipelineRoles[0];
    }
    if (selectedPipelineTriggers.length > 0 && !selectedPipelineTriggers.includes(trackerSuccessTrigger)) {
      trackerSuccessTrigger = selectedPipelineTriggers[0];
    }
  });

  $effect(() => {
    component;
    name;
    if (activeTab === "chat" && !supportsChat) {
      activeTab = "overview";
    }
    if ((activeTab === "history" || activeTab === "memory" || activeTab === "skills" || activeTab === "mcp") && !supportsAgentData) {
      activeTab = "overview";
    }
    if (activeTab === "hooks" && !supportsHooks) {
      activeTab = "overview";
    }
    if (activeTab === "cron" && !supportsCron) {
      activeTab = "overview";
    }
    if (activeTab === "docs" && !component) {
      activeTab = "overview";
    }
    if (activeTab === "tickets" && !supportsTicketsUi) {
      activeTab = "overview";
    }
    if (activeTab === "boiler" && !supportsBoilerUi) {
      activeTab = "overview";
    }
  });

  $effect(() => {
    if (routeTabs.has(activeTab)) syncTabHash(activeTab);
  });

  $effect(() => {
    const marker = onboardingPending
      ? `${instanceRouteKey}:${onboardingMarker || "bootstrap"}`
      : "";
    if (!marker || !chatReady) return;
    if (activeTab !== "overview") return;
    if (bootstrapChatAutoOpenedFor === marker) return;

    bootstrapChatAutoOpenedFor = marker;
    activeTab = "chat";
  });

  $effect(() => {
    if (!component || !name) return;
    if (initializedRouteKey === instanceRouteKey) return;
    initializedRouteKey = instanceRouteKey;
    instance = null;
    config = null;
    providerHealth = null;
    usageData = null;
    integration = null;
    integrationError = null;
    linkingIntegration = false;
    selectedWatch = "";
    selectedClaw = "";
    selectedTracker = "";
    selectedPipeline = "";
    trackerClaimRole = "coder";
    trackerSuccessTrigger = "complete";
    trackerConcurrency = "1";
    ticketsPipelines = [];
    ticketsTasks = [];
    ticketsDataError = "";
    ticketsActionError = "";
    ticketsActionMessage = "";
    ticketTaskPipeline = "";
    ticketTaskTitle = "";
    ticketTaskDescription = "";
    ticketTaskPriority = "0";
    ticketClaimAgent = "nullhub";
    ticketClaimRole = "coder";
    ticketClaimTtl = "300000";
    claimedTicket = null;
    lastTicketsRefreshAt = 0;
    onboardingStatus = null;
    bootstrapChatAutoOpenedFor = "";
    bootstrapNoticeHidden = false;
    lastUsageRefreshAt = 0;
    lastIntegrationRefreshAt = 0;
    integrationRequestSeq += 1;
    void refresh(true, true);
  });

  onMount(() => {
    const applyHashTab = () => {
      const tab = hashTab();
      if (tab) activeTab = tab;
    };

    applyHashTab();
    window.addEventListener("hashchange", applyHashTab);

    const stopPolling = pollWhileVisible(refresh, 5000);
    return () => {
      stopPolling();
      window.removeEventListener("hashchange", applyHashTab);
    };
  });

  async function start() {
    loading = true;
    instance = { ...instance, status: "starting" };
    try {
      await api.startInstance(component, name, { verbose: Boolean(instance?.verbose) });
      await refresh();
    } catch {
      instance = { ...instance, status: "stopped" };
    } finally {
      loading = false;
    }
  }
  async function startAgent() {
    loading = true;
    instance = { ...instance, status: "starting" };
    try {
      await api.startInstance(component, name, {
        launch_mode: "agent",
        verbose: Boolean(instance?.verbose),
      });
      await refresh();
    } catch {
      instance = { ...instance, status: "stopped" };
    } finally {
      loading = false;
    }
  }
  async function stop() {
    loading = true;
    instance = { ...instance, status: "stopping" };
    try {
      await api.stopInstance(component, name);
      await refresh();
    } catch {
      instance = { ...instance, status: "running" };
    } finally {
      loading = false;
    }
  }
  async function restart() {
    loading = true;
    instance = { ...instance, status: "restarting" };
    try {
      await api.restartInstance(component, name, { verbose: Boolean(instance?.verbose) });
      await refresh();
    } catch {
    } finally {
      loading = false;
    }
  }
  function clearDeletedInstanceSelection() {
    if (component === "nullboiler" && getSelectedBoilerInstance() === name) {
      setSelectedBoilerInstance("");
    }
    if (component === "nulltickets" && getSelectedTicketsInstance() === name) {
      setSelectedTicketsInstance("");
    }
  }
  async function deleteInstanceAndLeave(force = false) {
    await api.deleteInstance(component, name, force ? { force: true } : undefined);
    clearDeletedInstanceSelection();
    await goto("/");
  }
  function formatDeleteDependents(body: any): string {
    const dependents = Array.isArray(body?.dependents) ? body.dependents : [];
    if (dependents.length === 0) return "linked instances";
    return dependents
      .map((dep: any) => {
        const id = `${dep?.component || "instance"}/${dep?.name || "unknown"}`;
        return dep?.relation ? `${id} (${dep.relation})` : id;
      })
      .join(", ");
  }
  async function remove() {
    if (confirm("Are you sure you want to delete this instance?")) {
      loading = true;
      try {
        await deleteInstanceAndLeave();
      } catch (e) {
        const error = e as ApiRequestError;
        if (error.status === 409 && error.body?.force_required) {
          const dependents = formatDeleteDependents(error.body);
          if (
            confirm(
              `This instance is linked by ${dependents}. Delete it anyway and unlink those references?`,
            )
          ) {
            try {
              await deleteInstanceAndLeave(true);
            } catch (forceError) {
              console.error(forceError);
            }
          }
          return;
        }
        console.error(e);
      } finally {
        loading = false;
      }
    }
  }
  async function setMode(mode: string) {
    await api.patchInstance(component, name, { launch_mode: mode });
    await refresh();
  }
  async function toggleAutoStart() {
    await api.patchInstance(component, name, {
      auto_start: !instance?.auto_start,
    });
    await refresh();
  }
  async function toggleVerbose() {
    await api.patchInstance(component, name, {
      verbose: !instance?.verbose,
    });
    await refresh();
  }
</script>

<div class="instance-detail" class:docs-focus={activeTab === "docs"}>
  <PageHeader title={name} subtitle={headerSubtitle}>
    {#snippet controls()}
      <Badge variant={statusVariant}>{statusValue}</Badge>
    {/snippet}
    {#snippet actions()}
      <Button
        variant="outline"
        size="icon-sm"
        onclick={start}
        disabled={loading}
        title="Start"
        aria-label="Start instance"
      >
        <PlayIcon />
      </Button>
      {#if supportsAgentData}
        <Button
          variant="outline"
          size="sm"
          onclick={startAgent}
          disabled={loading}
          title="Start in agent mode"
        >
          <BotIcon />
          Agent
        </Button>
      {/if}
      <Button
        variant="outline"
        size="icon-sm"
        onclick={stop}
        disabled={loading}
        title="Stop"
        aria-label="Stop instance"
      >
        <SquareIcon />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        onclick={restart}
        disabled={loading}
        title="Restart"
        aria-label="Restart instance"
      >
        <RotateCcwIcon />
      </Button>
      {#if component === "nullwatch"}
        <Button
          variant="outline"
          size="sm"
          href={`/nullwatch?watch=${encodeURIComponent(name)}`}
          title="Open NullWatch"
        >
          <RadioIcon />
          NullWatch
        </Button>
      {/if}
      <Button
        variant="destructive"
        size="icon-sm"
        onclick={remove}
        disabled={loading}
        title="Delete"
        aria-label="Delete instance"
      >
        <Trash2Icon />
      </Button>
    {/snippet}
  </PageHeader>

  <Tabs bind:value={activeTab} class="instance-tabs">
    <TabsList>
      <TabsTrigger value="overview">Overview</TabsTrigger>
      {#if supportsChat}
        <TabsTrigger value="chat">
          Chat{#if !providerStatus.configured}<span class="tab-warn">!</span>{/if}
        </TabsTrigger>
      {/if}
      {#if supportsAgentData}
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="memory">Memory</TabsTrigger>
        <TabsTrigger value="skills">Skills</TabsTrigger>
        <TabsTrigger value="mcp">MCP</TabsTrigger>
        <TabsTrigger value="hooks">Hooks</TabsTrigger>
        <TabsTrigger value="cron">Cron</TabsTrigger>
      {/if}
      {#if supportsTicketsUi}
        <TabsTrigger value="tickets">Tickets</TabsTrigger>
      {/if}
      <TabsTrigger value="docs">Docs</TabsTrigger>
      {#if supportsBoilerUi}
        <TabsTrigger value="boiler">Boiler</TabsTrigger>
      {/if}
      <TabsTrigger value="config">Config</TabsTrigger>
      <TabsTrigger value="logs">Logs</TabsTrigger>
      <TabsTrigger value="advanced">Advanced</TabsTrigger>
    </TabsList>
  </Tabs>

  <div class="tab-content">
    {#if activeTab === "overview"}
      <div class="overview-grid">
        <Card class="info-card">
          <span class="label">Status</span>
          <Badge variant={statusVariant}>{statusValue}</Badge>
        </Card>
        <Card class="info-card">
          <span class="label">Version</span>
          <span>{instance?.version || "-"}</span>
        </Card>
        <Card class="info-card">
          <span class="label">Launch Mode</span>
          <span>{displayLaunchMode(instance?.launch_mode)}</span>
        </Card>
        <Card class="info-card">
          <Label class="toggle-row">
            <span class="label">Auto Start</span>
            <Switch checked={Boolean(instance?.auto_start)} onclick={toggleAutoStart} />
          </Label>
        </Card>
        {#if supportsVerboseStartup}
          <Card class="info-card">
            <Label class="toggle-row">
              <span class="label">Verbose</span>
              <Switch checked={Boolean(instance?.verbose)} onclick={toggleVerbose} />
            </Label>
          </Card>
        {/if}
        {#if instance?.pid}
          <Card class="info-card">
            <span class="label">PID</span>
            <span class="mono">{instance.pid}</span>
          </Card>
        {/if}
        {#if instance?.status === "running" && instance?.uptime_seconds != null}
          <Card class="info-card">
            <span class="label">Uptime</span>
            <span>{formatUptime(instance.uptime_seconds)}</span>
          </Card>
        {/if}
        {#if instance?.port}
          <Card class="info-card">
            <span class="label">{componentPortLabel(component)} Port</span>
            <span class="mono">{instance.port}</span>
          </Card>
        {/if}
        {#if instance?.restart_count}
          <Card class="info-card">
            <span class="label">Restart Count</span>
            <span>{instance.restart_count}</span>
          </Card>
        {/if}
        {#if providerStatus.provider}
          <Card class={providerCardWarn ? "info-card card-warn" : "info-card"}>
            <span class="label">Provider</span>
            <div class="provider-status">
              <span
                class="status-dot"
                class:ok={providerDotOk}
                class:err={!providerDotOk}
              ></span>
              <span>{providerStatus.provider}</span>
            </div>
            {#if providerHintText}
              <span class="provider-hint">{providerHintText}</span>
            {/if}
          </Card>
        {/if}
        {#if providerStatus.model}
          <Card class="info-card">
            <span class="label">Model</span>
            <span>{providerStatus.model}</span>
          </Card>
        {/if}
        {#if webPort}
          <Card class="info-card">
            <span class="label">Web Channel Port</span>
            <span class="mono">{webPort}</span>
          </Card>
        {/if}
        {#if supportsIntegration}
          <Card class="info-card integration-card">
            <div class="integration-header">
              <span class="label"
                >{component === "nullclaw"
                  ? "Telemetry"
                  : component === "nullwatch"
                    ? "Observed Agents"
                  : component === "nullboiler"
                    ? "NullTickets Link"
                    : "Linked NullBoilers"}</span
              >
              {#if (component === "nullboiler" && integration?.linked_tracker) || (component === "nullclaw" && linkedWatch) || (component === "nullwatch" && linkedClaws.length > 0) || (component === "nulltickets" && linkedBoilers.length > 0)}
                <span class="integration-badge">Linked</span>
              {/if}
            </div>

            {#if integrationLoading && !integration}
              <span class="integration-muted">Loading integration status...</span>
            {:else if integrationError}
              <span class="integration-error">{integrationError}</span>
            {:else if component === "nullclaw"}
              <div class="integration-block">
                <span class="integration-title">Observer</span>
                {#if linkedWatch}
                  <span class="mono">{linkedWatch.name}:{linkedWatch.port}</span>
                {:else if currentTelemetryLink}
                  <span class="integration-muted mono">{currentTelemetryLink.endpoint}</span>
                {:else}
                  <span class="integration-muted">No NullWatch linked yet.</span>
                {/if}
              </div>

              {#if currentTelemetryLink}
                <div class="integration-block">
                  <span class="integration-title">OTLP</span>
                  <div class="integration-stats compact">
                    <div>
                      <span class="stat-label">Endpoint</span>
                      <span class="mono">{currentTelemetryLink.endpoint}</span>
                    </div>
                    <div>
                      <span class="stat-label">Service</span>
                      <span class="mono">{currentTelemetryLink.service_name || "-"}</span>
                    </div>
                    <div>
                      <span class="stat-label">Auth</span>
                      <span>{currentTelemetryLink.auth_header ? "Bearer" : "None"}</span>
                    </div>
                    <div>
                      <span class="stat-label">Source Header</span>
                      <span>{currentTelemetryLink.source_header ? "On" : "Off"}</span>
                    </div>
                  </div>
                </div>
              {/if}

              {#if watchOptions.length > 0}
                <div class="integration-form">
                  <Label class="integration-field">
                    <span>Local observer</span>
                    <Select bind:value={selectedWatch} disabled={linkingIntegration}>
                      <option value="">Select NullWatch</option>
                      {#each watchOptions as watch}
                        <option value={watch.name}>
                          {watch.name} ({watch.port}){watch.running ? "" : " - stopped"}
                        </option>
                      {/each}
                    </Select>
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    class="integration-btn"
                    onclick={linkNullWatch}
                    disabled={linkingIntegration || !selectedWatch}
                  >
                    {linkingIntegration
                      ? "Linking..."
                      : linkedWatch
                        ? "Relink NullWatch"
                        : "Link NullWatch"}
                  </Button>
                  {#if linkedWatch}
                    <Button
                      variant="outline"
                      size="sm"
                      class="integration-btn"
                      href={`/nullwatch?watch=${encodeURIComponent(linkedWatch.name)}`}
                    >
                      Open NullWatch
                    </Button>
                  {/if}
                </div>
              {:else}
                <span class="integration-muted">Install NullWatch to link telemetry.</span>
              {/if}
            {:else if component === "nullwatch"}
              <div class="integration-block">
                <span class="integration-title">Linked Agents</span>
                {#if linkedClaws.length > 0}
                  <div class="integration-list">
                    {#each linkedClaws as claw}
                      <div class="integration-list-item">
                        <div>
                          <span class="integration-title">{claw.name}</span>
                          <span class="integration-muted"
                            >{claw.running ? "running" : "stopped"}</span
                          >
                        </div>
                        <Button variant="outline" size="sm" class="integration-btn" href={instanceRoute("nullclaw", claw.name)}>
                          Open
                        </Button>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <span class="integration-muted">No agents linked yet.</span>
                {/if}
              </div>

              {#if clawOptions.length > 0}
                <div class="integration-form">
                  <Label class="integration-field">
                    <span>Local Agent</span>
                    <Select bind:value={selectedClaw} disabled={linkingIntegration}>
                      <option value="">Select Agent</option>
                      {#each clawOptions as claw}
                        <option value={claw.name}>
                          {claw.name}{claw.linked ? " - linked" : ""}{claw.running ? "" : " - stopped"}
                        </option>
                      {/each}
                    </Select>
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    class="integration-btn"
                    onclick={linkNullClawToWatch}
                    disabled={linkingIntegration || !selectedClaw}
                  >
                    {linkingIntegration ? "Linking..." : "Link Agent"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="integration-btn"
                    href={`/nullwatch?watch=${encodeURIComponent(name)}`}
                  >
                    Open NullWatch
                  </Button>
                </div>
              {:else}
                <span class="integration-muted">Install an agent to send telemetry here.</span>
              {/if}
            {:else if component === "nullboiler"}
              <div class="integration-block">
                <span class="integration-title">NullBoiler</span>
                <span class="mono">
                  {integration?.instance?.name || name}:{integration?.instance?.port || instance?.port || "-"}
                </span>
                {#if integration?.instance?.running === true}
                  <span class="integration-badge">Running</span>
                {:else if integration?.instance?.running === false}
                  <span class="integration-muted">Stopped</span>
                {/if}
              </div>

              <div class="integration-block">
                <span class="integration-title">Tracker</span>
                {#if integration?.linked_tracker}
                  <span class="mono"
                    >{integration.linked_tracker.name}:{integration.linked_tracker.port}</span
                  >
                {:else if integration?.configured_tracker?.url}
                  <span class="mono">{integration.configured_tracker.url}</span>
                  <span class="integration-muted">No matching local NullTickets instance.</span>
                {:else if integration?.configured}
                  <span class="integration-muted">Tracker config exists without a target URL.</span>
                {:else}
                  <span class="integration-muted">No tracker linked yet.</span>
                {/if}
              </div>

              {#if integration?.tracker}
                <div class="integration-stats">
                  <div>
                    <span class="stat-label">Running</span>
                    <span>{integration.tracker.running_count || 0}</span>
                  </div>
                  <div>
                    <span class="stat-label">Completed</span>
                    <span>{integration.tracker.completed_count || 0}</span>
                  </div>
                  <div>
                    <span class="stat-label">Failed</span>
                    <span>{integration.tracker.failed_count || 0}</span>
                  </div>
                  <div>
                    <span class="stat-label">Max Concurrent</span>
                    <span>{integration.tracker.max_concurrent || 0}</span>
                  </div>
                </div>
              {/if}

              {#if integration?.current_link}
                <div class="integration-block">
                  <span class="integration-title">Workflow</span>
                  <div class="integration-stats compact">
                    <div>
                      <span class="stat-label">Pipeline</span>
                      <span class="mono">{integration.current_link.pipeline_id}</span>
                    </div>
                    <div>
                      <span class="stat-label">Claim Role</span>
                      <span class="mono">{integration.current_link.claim_role}</span>
                    </div>
                    <div>
                      <span class="stat-label">Trigger</span>
                      <span class="mono">{integration.current_link.success_trigger}</span>
                    </div>
                    <div>
                      <span class="stat-label">Workflow File</span>
                      <span class="mono">{integration.current_link.workflow_file || "-"}</span>
                    </div>
                  </div>
                </div>
              {/if}

              {#if queueSummary.roles.length > 0}
                <div class="integration-block">
                  <span class="integration-title">Queue</span>
                  <div class="integration-stats compact">
                    <div>
                      <span class="stat-label">Claimable</span>
                      <span>{queueSummary.claimable}</span>
                    </div>
                    <div>
                      <span class="stat-label">Failed</span>
                      <span>{queueSummary.failed}</span>
                    </div>
                    <div>
                      <span class="stat-label">Stuck</span>
                      <span>{queueSummary.stuck}</span>
                    </div>
                    <div>
                      <span class="stat-label">Lease Risk</span>
                      <span>{queueSummary.nearExpiry}</span>
                    </div>
                  </div>
                </div>
              {/if}

              <div class="integration-actions">
                <Button
                  variant="outline"
                  size="sm"
                  class="integration-btn"
                  onclick={() => openBoilerRoute(nullboilerUiRoutes.workflows())}
                >
                  Workflows
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="integration-btn"
                  onclick={() => openBoilerRoute(nullboilerUiRoutes.runs())}
                >
                  Runs
                </Button>
              </div>

              <div class="integration-form">
                <Label class="integration-field">
                  <span>Local tracker</span>
                  <Select bind:value={selectedTracker} disabled={linkingIntegration}>
                    <option value="">Select tracker</option>
                    {#each trackerOptions as tracker}
                      <option value={tracker.name}>
                        {tracker.name} ({tracker.port}){tracker.running ? "" : " - stopped"}
                      </option>
                    {/each}
                  </Select>
                </Label>
                <Label class="integration-field">
                  <span>Pipeline</span>
                  {#if selectedTrackerPipelines.length > 0}
                    <Select bind:value={selectedPipeline} disabled={linkingIntegration}>
                      <option value="">Select pipeline</option>
                      {#each selectedTrackerPipelines as pipeline}
                        <option value={pipeline.id}>
                          {pipeline.name || pipeline.id} ({pipeline.id})
                        </option>
                      {/each}
                    </Select>
                  {:else}
                    <Input bind:value={selectedPipeline} placeholder="pipeline-id" />
                  {/if}
                </Label>
                <Label class="integration-field">
                  <span>Claim role</span>
                  {#if selectedPipelineRoles.length > 0}
                    <Select bind:value={trackerClaimRole} disabled={linkingIntegration}>
                      {#each selectedPipelineRoles as role}
                        <option value={role}>{role}</option>
                      {/each}
                    </Select>
                  {:else}
                    <Input bind:value={trackerClaimRole} placeholder="coder" />
                  {/if}
                </Label>
                <Label class="integration-field">
                  <span>Success trigger</span>
                  {#if selectedPipelineTriggers.length > 0}
                    <Select bind:value={trackerSuccessTrigger} disabled={linkingIntegration}>
                      {#each selectedPipelineTriggers as trigger}
                        <option value={trigger}>{trigger}</option>
                      {/each}
                    </Select>
                  {:else}
                    <Input bind:value={trackerSuccessTrigger} placeholder="complete" />
                  {/if}
                </Label>
                <Label class="integration-field">
                  <span>Concurrency</span>
                  <Input bind:value={trackerConcurrency} inputmode="numeric" />
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  class="integration-btn"
                  onclick={linkTracker}
                  disabled={linkingIntegration || !selectedTracker || !selectedPipeline.trim()}
                >
                  {linkingIntegration ? "Linking..." : "Link Tracker"}
                </Button>
              </div>
            {:else}
              <div class="integration-block">
                <span class="integration-title">Tracker</span>
                <span class="mono">
                  {integration?.instance?.name || name}:{integration?.instance?.port || instance?.port || "-"}
                </span>
                {#if integration?.instance?.running === true}
                  <span class="integration-badge">Running</span>
                {:else if integration?.instance?.running === false}
                  <span class="integration-muted">Stopped</span>
                {/if}
              </div>

              <div class="integration-block">
                <span class="integration-title">Queue</span>
                {#if queueSummary.roles.length > 0}
                  <div class="integration-stats compact">
                    <div>
                      <span class="stat-label">Claimable</span>
                      <span>{queueSummary.claimable}</span>
                    </div>
                    <div>
                      <span class="stat-label">Failed</span>
                      <span>{queueSummary.failed}</span>
                    </div>
                    <div>
                      <span class="stat-label">Stuck</span>
                      <span>{queueSummary.stuck}</span>
                    </div>
                    <div>
                      <span class="stat-label">Lease Risk</span>
                      <span>{queueSummary.nearExpiry}</span>
                    </div>
                  </div>
                {:else}
                  <span class="integration-muted">Queue stats appear when the tracker is running.</span>
                {/if}
              </div>

              <div class="integration-actions">
                <Button variant="outline" size="sm" class="integration-btn" onclick={openTicketsStore}>
                  Store
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="integration-btn"
                  onclick={() => refreshTicketsData(true)}
                  disabled={ticketsDataLoading || integration?.instance?.running !== true}
                >
                  {ticketsDataLoading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>

              {#if ticketsDataError}
                <span class="integration-error">{ticketsDataError}</span>
              {/if}
              {#if ticketsActionError}
                <span class="integration-error">{ticketsActionError}</span>
              {:else if ticketsActionMessage}
                <span class="integration-muted">{ticketsActionMessage}</span>
              {/if}

              <div class="integration-block">
                <span class="integration-title">Task Actions</span>
                <div class="integration-form">
                  <Label class="integration-field">
                    <span>Pipeline</span>
                    {#if ticketsPipelines.length > 0}
                      <Select bind:value={ticketTaskPipeline} disabled={ticketsDataLoading}>
                        {#each ticketsPipelines as pipeline}
                          <option value={pipelineId(pipeline)}>
                            {pipelineName(pipeline)} ({pipelineId(pipeline)})
                          </option>
                        {/each}
                      </Select>
                    {:else}
                      <Input bind:value={ticketTaskPipeline} placeholder="pipeline-id" />
                    {/if}
                  </Label>
                  <Label class="integration-field">
                    <span>Title</span>
                    <Input bind:value={ticketTaskTitle} placeholder="Task title" />
                  </Label>
                  <Label class="integration-field">
                    <span>Priority</span>
                    <Input bind:value={ticketTaskPriority} inputmode="numeric" />
                  </Label>
                  <Label class="integration-field wide">
                    <span>Description</span>
                    <Textarea bind:value={ticketTaskDescription} rows={3} />
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    class="integration-btn"
                    onclick={createTicketTask}
                    disabled={ticketsDataLoading || integration?.instance?.running !== true || !ticketTaskPipeline.trim() || !ticketTaskTitle.trim()}
                  >
                    Create Task
                  </Button>
                </div>
              </div>

              <div class="integration-block">
                <span class="integration-title">Claim Next</span>
                <div class="integration-form">
                  <Label class="integration-field">
                    <span>Agent</span>
                    <Input bind:value={ticketClaimAgent} placeholder="nullhub" />
                  </Label>
                  <Label class="integration-field">
                    <span>Role</span>
                    {#if queueSummary.roles.length > 0}
                      <Select bind:value={ticketClaimRole} disabled={ticketsDataLoading}>
                        {#each queueSummary.roles as role}
                          <option value={role.role}>
                            {role.role} ({role.claimable_count || 0})
                          </option>
                        {/each}
                      </Select>
                    {:else}
                      <Input bind:value={ticketClaimRole} placeholder="coder" />
                    {/if}
                  </Label>
                  <Label class="integration-field">
                    <span>Lease TTL ms</span>
                    <Input bind:value={ticketClaimTtl} inputmode="numeric" />
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    class="integration-btn"
                    onclick={claimTicketTask}
                    disabled={ticketsDataLoading || integration?.instance?.running !== true || !ticketClaimRole.trim()}
                  >
                    Claim Task
                  </Button>
                </div>
                {#if claimedTicket?.task}
                  <span class="integration-muted">
                    {taskTitle(claimedTicket.task)} - <span class="mono">{claimedTicket.lease_id}</span>
                  </span>
                {/if}
              </div>

              {#if ticketsTasks.length > 0}
                <div class="integration-block">
                  <span class="integration-title">Recent Tasks</span>
                  <div class="integration-list">
                    {#each ticketsTasks.slice(0, 6) as task}
                      <div class="integration-list-item">
                        <div>
                          <span class="integration-title">{taskTitle(task)}</span>
                          <span class="integration-muted mono"> {task.id || ""}</span>
                        </div>
                        <span class="integration-muted"
                          >{task.stage || "-"} / {task.pipeline_id || "-"}</span
                        >
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if linkedBoilers.length > 0}
                <div class="integration-list">
                  {#each linkedBoilers as boiler}
                    <div class="integration-list-item">
                      <div>
                        <span class="integration-title">{boiler.name}</span>
                        <span class="integration-muted mono">:{boiler.port}</span>
                      </div>
                      {#if boiler.tracker}
                        <span class="integration-muted"
                          >{boiler.tracker.running_count || 0} running / {boiler.tracker.failed_count || 0} failed</span
                        >
                      {/if}
                    </div>
                  {/each}
                </div>
              {:else}
                <span class="integration-muted">No linked NullBoiler instances detected.</span>
              {/if}
            {/if}
          </Card>
        {/if}
        {#if supportsUsage}
          <Card class="info-card usage-card">
            <div class="usage-header">
              <span class="label">LLM Usage</span>
              <Select class="usage-window" bind:value={usageWindow}>
                <option value="24h">24h</option>
                <option value="7d">7d</option>
                <option value="30d">30d</option>
                <option value="all">All</option>
              </Select>
            </div>
            {#if usageLoading}
              <span class="usage-empty">Loading usage...</span>
            {:else if !usageData?.rows || usageData.rows.length === 0}
              <span class="usage-empty">No usage data for selected window.</span>
            {:else}
              <div class="usage-table-wrap">
                <table class="usage-table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Model</th>
                      <th>To provider (prompt)</th>
                      <th>From provider (completion)</th>
                      <th>Total</th>
                      <th>Requests</th>
                      <th>Last used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each [...usageData.rows].sort((a, b) => (b.total_tokens || 0) - (a.total_tokens || 0)) as row}
                      <tr>
                        <td>{row.provider}</td>
                        <td class="mono">{row.model}</td>
                        <td>{formatTokens(row.prompt_tokens)}</td>
                        <td>{formatTokens(row.completion_tokens)}</td>
                        <td>{formatTokens(row.total_tokens)}</td>
                        <td>{row.requests || 0}</td>
                        <td>{formatLastUsed(row.last_used)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
            {#if usageData?.totals}
              <div class="usage-total">
                Total: {formatTokens(usageData.totals.total_tokens)} tokens in {usageData.totals.requests || 0} request(s)
              </div>
            {/if}
          </Card>
        {/if}
      </div>
    {:else if activeTab === "history"}
      {#key instanceRouteKey}
        <InstanceHistoryPanel {component} {name} active={activeTab === "history"} />
      {/key}
    {:else if activeTab === "memory"}
      {#key instanceRouteKey}
        <InstanceMemoryPanel {component} {name} active={activeTab === "memory"} />
      {/key}
    {:else if activeTab === "skills"}
      {#key instanceRouteKey}
        <InstanceSkillsPanel {component} {name} active={activeTab === "skills"} />
      {/key}
    {:else if activeTab === "mcp"}
      {#key instanceRouteKey}
        <InstanceMcpPanel {component} {name} active={activeTab === "mcp"} />
      {/key}
    {:else if activeTab === "hooks"}
      {#key instanceRouteKey}
        <InstanceHooksPanel {component} {name} active={activeTab === "hooks"} />
      {/key}
    {:else if activeTab === "cron"}
      {#key instanceRouteKey}
        <InstanceCronPanel {component} {name} active={activeTab === "cron"} />
      {/key}
    {:else if activeTab === "docs"}
      {#key instanceRouteKey}
        <MarkdownManagerPanel
          {component}
          {name}
          active={activeTab === "docs"}
        />
      {/key}
    {:else if activeTab === "tickets"}
      {#key instanceRouteKey}
        <NullTicketsPanel
          {component}
          {name}
          active={activeTab === "tickets"}
          running={integration?.instance?.running === true || instance?.status === "running"}
        />
      {/key}
    {:else if activeTab === "boiler"}
      {#key instanceRouteKey}
        <NullBoilerPanel
          {component}
          {name}
          active={activeTab === "boiler"}
          running={integration?.instance?.running === true || instance?.status === "running"}
        />
      {/key}
    {:else if activeTab === "config"}
      {#key instanceRouteKey}
        <ConfigEditor {component} {name} onAction={refresh} />
      {/key}
    {:else if activeTab === "logs"}
      {#key instanceRouteKey}
        <LogViewer {component} {name} />
      {/key}
    {:else if activeTab === "advanced"}
      <div class="advanced-panel">
        <div class="advanced-card">
          <h3>Standalone Launch</h3>
          {#if standaloneBinaryPath}
            <p>
              Run this instance without <code>nullhub</code>, reusing the same
              config, auth, data, and logs directory.
            </p>
            <div class="advanced-copy-row">
              <span class="advanced-copy-hint">
                {#if standaloneCopyState === "copied"}
                  Copied
                {:else if standaloneCopyState === "error"}
                  Copy failed
                {:else}
                  Click to copy
                {/if}
              </span>
            </div>
            <button
              type="button"
              class="advanced-code advanced-code-copy"
              onclick={() => void copyStandaloneLaunchScript()}
              onkeydown={handleStandaloneLaunchKeydown}
              aria-label="Copy standalone launch command"
            ><code>{standaloneLaunchScript}</code></button>
            <div class="advanced-meta">
              <div>
                <span class="advanced-label">Config</span>
                <code>{standaloneConfigPath}</code>
              </div>
              <div>
                <span class="advanced-label">Instance Home</span>
                <code>{standaloneHomePath}</code>
              </div>
              <div>
                <span class="advanced-label">Binary</span>
                <code>{standaloneBinaryPath}</code>
              </div>
            </div>
            <p class="advanced-note">
              If your `nullhub` root is custom, export <code>NULLHUB_HOME</code>
              before running the command.
            </p>
          {:else}
            <p>
              Standalone launch instructions are available after this instance has a versioned binary.
            </p>
          {/if}
        </div>
      </div>
    {:else if activeTab === "chat"}
      {#if !providerStatus.configured}
        <div class="chat-blocked">
          <div class="chat-blocked-icon">!</div>
          <div class="chat-blocked-title">LLM Provider Not Configured</div>
          <div class="chat-blocked-desc">
            No API key found for provider <code
              >{providerStatus.provider || "unknown"}</code
            >. Set up a provider API key in the
            <Button variant="link" class="h-auto p-0 align-baseline" onclick={() => (activeTab = "config")}>
              Config
            </Button> tab to use chat.
          </div>
          {#if providerStatus.model}
            <div class="chat-blocked-model">
              Model: <code
                >{providerStatus.provider}/{providerStatus.model}</code
              >
            </div>
          {/if}
        </div>
      {:else if instance?.status !== "running"}
        <div class="chat-unavailable">
          Agent is not running.
        </div>
      {:else}
        <div class="chat-stack">
          {#if onboardingPending && !bootstrapNoticeHidden}
            <details class="chat-onboarding">
              <summary class="chat-onboarding-summary">
                <span class="chat-onboarding-title">Bootstrap setup</span>
                <span class="chat-onboarding-note">
                  Auto-starts with <code>{onboardingStarterMessage}</code>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  class="chat-onboarding-hide"
                  aria-label="Hide bootstrap setup notice"
                  onclick={(event) => {
                    event.preventDefault();
                    bootstrapNoticeHidden = true;
                  }}
                >
                  Hide
                </Button>
              </summary>
              <div class="chat-onboarding-body">
                This first chat helps define the agent's name, nature, vibe, emoji, and how it
                should address you.
              </div>
            </details>
          {/if}
          {#key instanceRouteKey}
            <NullClawChatSurface
              {component}
              {name}
              active={activeTab === "chat"}
              mode="page"
              autoStartMessage={onboardingPending ? onboardingStarterMessage : ""}
              autoStartMarker={onboardingMarker}
            />
          {/key}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .instance-detail {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .tab-content {
    min-height: 400px;
  }

  /* Docs tab takes over the full surface; hide chrome. */
  .instance-detail.docs-focus {
    max-width: none;
    height: calc(100% + 3rem);
    margin: -1.5rem;
    padding: 0;
    gap: 0;
  }
  .docs-focus :global(header.page-header) {
    display: none;
  }
  .docs-focus :global(.instance-tabs) {
    display: none;
  }
  .docs-focus .tab-content {
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .tab-warn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    margin-left: 0.25rem;
    border-radius: 9999px;
    background: var(--shadcn-destructive);
    color: #fff;
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 1;
  }

  /* Overview grid of Cards */
  .overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
  }
  :global(.info-card) {
    gap: 0.5rem;
    padding-left: 1.25rem;
    padding-right: 1.25rem;
  }
  :global(.usage-card),
  :global(.integration-card) {
    grid-column: 1 / -1;
  }

  .label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--shadcn-muted-foreground);
  }

  :global(.toggle-row) {
    justify-content: space-between;
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8125rem;
    color: var(--shadcn-foreground);
  }

  /* Provider status */
  .provider-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--shadcn-foreground);
  }
  .status-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 9999px;
    background: var(--shadcn-muted-foreground);
  }
  .status-dot.ok {
    background: #10b981;
  }
  .status-dot.err {
    background: var(--shadcn-destructive);
  }
  .provider-hint {
    font-size: 0.75rem;
    color: var(--shadcn-destructive);
  }
  :global(.info-card.card-warn) {
    border-color: color-mix(in srgb, var(--shadcn-destructive) 35%, var(--shadcn-border));
  }

  /* Integration card internals */
  .integration-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .integration-badge {
    padding: 0.125rem 0.5rem;
    border: 1px solid #a7f3d0;
    color: #047857;
    background: #ecfdf5;
    border-radius: var(--radius-md, calc(var(--shadcn-radius) - 2px));
    font-size: 0.6875rem;
    font-weight: 500;
  }
  .integration-block {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .integration-title {
    font-size: 0.8125rem;
    color: var(--shadcn-foreground);
    font-weight: 600;
  }
  .integration-muted {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }
  .integration-error {
    color: var(--shadcn-destructive);
    font-size: 0.8125rem;
  }
  .integration-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.5rem;
  }
  .integration-stats.compact {
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  }
  .integration-stats div {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-background);
    border-radius: var(--radius-md, calc(var(--shadcn-radius) - 2px));
  }
  .stat-label {
    color: var(--shadcn-muted-foreground);
    font-size: 0.6875rem;
  }
  .integration-form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
    align-items: end;
  }
  .integration-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  :global(.integration-field) {
    flex-direction: column;
    align-items: stretch;
    gap: 0.375rem;
  }
  :global(.integration-field.wide) {
    grid-column: 1 / -1;
  }
  :global(.integration-field > span) {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 500;
  }
  :global(.integration-btn) {
    align-self: end;
  }
  .integration-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .integration-list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-background);
    border-radius: var(--radius-md, calc(var(--shadcn-radius) - 2px));
  }

  /* Usage */
  .usage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  :global(.usage-window) {
    width: auto;
    min-width: 6rem;
  }
  .usage-table-wrap {
    overflow-x: auto;
  }
  .usage-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  .usage-table th,
  .usage-table td {
    text-align: left;
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--shadcn-border);
    white-space: nowrap;
  }
  .usage-table th {
    color: var(--shadcn-muted-foreground);
    font-size: 0.6875rem;
    font-weight: 500;
  }
  .usage-table td {
    color: var(--shadcn-foreground);
  }
  .usage-empty {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }
  .usage-total {
    margin-top: 0.5rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  /* Advanced tab */
  .advanced-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .advanced-card {
    padding: 1.25rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
  }
  .advanced-card h3 {
    margin: 0 0 0.75rem;
    color: var(--shadcn-foreground);
    font-size: 1rem;
    font-weight: 600;
  }
  .advanced-card p {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    line-height: 1.6;
  }
  .advanced-code {
    margin: 1rem 0;
    padding: 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
    overflow-x: auto;
  }
  .advanced-copy-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
    margin-bottom: -0.5rem;
  }
  .advanced-copy-hint {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 500;
  }
  .advanced-code-copy {
    display: block;
    width: 100%;
    text-align: left;
    cursor: copy;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .advanced-code-copy:hover,
  .advanced-code-copy:focus-visible {
    border-color: var(--shadcn-ring);
    outline: none;
  }
  .advanced-code code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
    color: var(--shadcn-foreground);
    white-space: pre;
  }
  .advanced-meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.75rem;
  }
  .advanced-meta div {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--radius-md, calc(var(--shadcn-radius) - 2px));
    background: var(--shadcn-background);
  }
  .advanced-label {
    color: var(--shadcn-muted-foreground);
    font-size: 0.72rem;
    font-weight: 500;
  }
  .advanced-meta code,
  .advanced-card code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8125rem;
    color: var(--shadcn-foreground);
  }
  .advanced-note {
    margin-top: 0.9rem !important;
    font-size: 0.82rem;
  }

  /* Chat blocked / unavailable */
  .chat-unavailable {
    color: var(--shadcn-muted-foreground);
    text-align: center;
    padding: 4rem;
    font-size: 0.95rem;
    border: 1px dashed var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
  }
  .chat-blocked {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    gap: 1rem;
    text-align: center;
    border: 1px dashed var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
  }
  .chat-blocked-icon {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 9999px;
    background: var(--shadcn-muted);
    border: 1px solid var(--shadcn-border);
    color: var(--shadcn-muted-foreground);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.75rem;
    font-weight: 600;
  }
  .chat-blocked-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--shadcn-foreground);
  }
  .chat-blocked-desc {
    color: var(--shadcn-muted-foreground);
    font-size: 0.9rem;
    max-width: 450px;
    line-height: 1.6;
  }
  .chat-blocked-desc code,
  .chat-blocked-model code {
    padding: 0.125rem 0.375rem;
    background: var(--shadcn-muted);
    border: 1px solid var(--shadcn-border);
    border-radius: var(--radius-sm, calc(var(--shadcn-radius) - 4px));
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8125rem;
    color: var(--shadcn-foreground);
  }
  .chat-blocked-model {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    margin-top: 0.5rem;
  }
  .chat-stack {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .chat-onboarding {
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
    color: var(--shadcn-muted-foreground);
  }
  .chat-onboarding-summary {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-height: 2.25rem;
    padding: 0.375rem 0.625rem;
    cursor: pointer;
    list-style: none;
  }
  .chat-onboarding-summary::-webkit-details-marker {
    display: none;
  }
  .chat-onboarding-title {
    color: var(--shadcn-foreground);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .chat-onboarding-note,
  .chat-onboarding-body {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    line-height: 1.4;
  }
  .chat-onboarding-note {
    min-width: 0;
    flex: 1;
  }
  .chat-onboarding code {
    color: var(--shadcn-foreground);
    background: var(--shadcn-muted);
    border: 1px solid var(--shadcn-border);
    border-radius: var(--radius-sm, calc(var(--shadcn-radius) - 4px));
    padding: 0.0625rem 0.25rem;
    font-size: 0.75rem;
  }
  .chat-onboarding-body {
    border-top: 1px solid var(--shadcn-border);
    padding: 0.5rem 0.625rem 0.625rem;
  }
  :global(.chat-onboarding-hide) {
    margin-left: auto;
  }

  @media (max-width: 700px) {
    .integration-list-item {
      flex-direction: column;
      align-items: flex-start;
    }
    .integration-form {
      grid-template-columns: 1fr;
    }
  }
</style>
