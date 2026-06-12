<script lang="ts">
  import SectionOverview, { type SectionOverviewSummary, type SectionOverviewTab } from "$lib/components/SectionOverview.svelte";

  const summaries: SectionOverviewSummary[] = [
    {
      label: "Providers",
      value: "Models",
      description: "Saved model providers and validation state.",
    },
    {
      label: "Channels",
      value: "Inputs",
      description: "Connected channels such as Telegram, web, and CLI.",
    },
    {
      label: "Operations",
      value: "Usage",
      description: "Usage, settings, config, and observability panels.",
    },
  ];

  const tabs: SectionOverviewTab[] = [
    {
      value: "access",
      label: "Access",
      description: "Provider and channel panels that connect the studio to external services.",
      links: [
        { label: "Providers", href: "/system/providers", description: "Saved model providers, models, keys, and validation.", status: "Primary" },
        { label: "Channels", href: "/system/channels", description: "Connected channels and account-specific channel config." },
      ],
    },
    {
      value: "configuration",
      label: "Configuration",
      description: "Admin settings and structured configuration panels.",
      links: [
        { label: "Settings", href: "/system/settings", description: "Hub settings, service state, and local access controls.", status: "Settings" },
        { label: "Configs", href: "/system/configs", description: "Structured provider, channel, and runtime configuration." },
      ],
    },
    {
      value: "operations",
      label: "Operations",
      description: "Operational views for usage and runtime observability.",
      links: [
        { label: "Usage", href: "/system/usage", description: "Token usage, request counts, and spend signal." },
        { label: "Observability", href: "/system/observability", description: "NullWatch runtime traces, diagnostics, and recovery links." },
      ],
    },
  ];
</script>

<SectionOverview
  title="System"
  subtitle="Providers, channels, usage, settings, and observability for the control surface."
  {summaries}
  {tabs}
  primaryHref="/system/providers"
  primaryLabel="Open providers"
/>
