import { normalizePackageManifest, type PackageManifest } from '$lib/api/packages';

export const rawMarketPackages = [
  {
    id: 'builtin.nullclaw-agent',
    name: 'NullClaw Agent Component',
    version: '1.0.0',
    scale: 'component',
    summary: 'Base managed agent runtime component for a Space.',
    requires: [{ kind: 'secret_ref', name: 'model_provider', secret_ref: 'providers.default.api_key' }],
    contributes: [{ kind: 'team_capability', name: 'agent-runtime' }],
    config: { component: 'nullclaw', launch_mode: 'managed' },
    seeds: [],
    extends: [],
    charter: {
      mission: 'Run one managed agent runtime.',
      autonomy_bounds: ['Use configured provider secret refs only'],
      metrics: ['runtime_health'],
    },
  },
  {
    id: 'builtin.loop-templates',
    name: 'Built-in Loop Templates',
    version: '1.0.0',
    scale: 'kit',
    summary: 'Local Loop catalog seeds for repeatable checks, iteration, and exit criteria.',
    requires: [
      { kind: 'package', id: 'builtin.nullclaw-agent' },
      { kind: 'component', name: 'nulltickets' },
    ],
    contributes: [
      { kind: 'loop_template', name: 'Ship PR Until Green' },
      { kind: 'loop_template', name: 'Test Until Green' },
    ],
    config: { taxonomy: 'loops', install_target: 'nulltickets.loop_library' },
    seeds: [
      {
        kind: 'loop_template',
        slug: 'test-until-green',
        name: 'Test Until Green',
        tagline: 'Run the test suite, fix failures, repeat until everything passes.',
      },
    ],
    extends: ['builtin.nullclaw-agent'],
    charter: {
      mission: 'Install durable Loop templates that make repeated agent work explicit.',
      autonomy_bounds: ['Each loop must define a check instruction and exit condition'],
      metrics: ['loop_templates_installed'],
    },
  },
  {
    id: 'builtin.mcp-server-starters',
    name: 'MCP Server Starters',
    version: '1.0.0',
    scale: 'kit',
    summary: 'Starter MCP server definitions for docs lookup, file-scoped work, and optional web search.',
    requires: [
      { kind: 'package', id: 'builtin.nullclaw-agent' },
      { kind: 'secret_ref', name: 'optional_search_api_key', secret_ref: 'providers.search.api_key' },
    ],
    contributes: [{ kind: 'mcp_server', name: 'context7-docs' }],
    config: { taxonomy: 'mcp_servers', install_target: 'nullclaw.config.mcp_servers' },
    seeds: [{ kind: 'mcp_server', name: 'context7-docs', description: 'Library documentation lookup.' }],
    extends: ['builtin.nullclaw-agent'],
    charter: {
      mission: 'Expose common local tools to agents through auditable MCP server definitions.',
      autonomy_bounds: ['MCP server env values use secret refs only'],
      metrics: ['mcp_servers_configured'],
    },
  },
  {
    id: 'builtin.space-operations',
    name: 'Space Operations Blueprint',
    version: '1.0.0',
    scale: 'blueprint',
    summary: 'A starter operating model for a small managed workspace.',
    requires: [{ kind: 'secret_ref', name: 'default_model_provider', secret_ref: 'providers.default.api_key' }],
    contributes: [{ kind: 'space_defaults', target: 'orders' }],
    config: { defaults: { autonomy: 'review_required' } },
    seeds: [{ kind: 'order', title: 'Daily operating brief' }],
    extends: ['builtin.ops-desk'],
    charter: {
      mission: 'Keep routine workspace operations visible, reviewed, and repeatable.',
      autonomy_bounds: ['Draft before execution'],
      metrics: ['open_orders'],
    },
  },
];

export const marketPackages: PackageManifest[] = rawMarketPackages.map(normalizePackageManifest);
