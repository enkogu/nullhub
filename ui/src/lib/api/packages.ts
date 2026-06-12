import { selectedSpaceFromEnvironment, type SpaceSelection } from '$lib/api/spaces';
import { encodePathSegment } from '$lib/nullstack/path';

type RequestFn = <T>(path: string, options?: RequestInit) => Promise<T>;
type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;
type WithQueryFn = (path: string, params: QueryParams) => string;

export type PackageScale = 'component' | 'kit' | 'blueprint' | string;
export type PackageItemType =
  | 'loop'
  | 'workflow'
  | 'skill'
  | 'mcp_server'
  | 'agent_profile'
  | 'blueprint'
  | 'order_template'
  | 'component'
  | 'package';
export type PackageStage = 'foundation' | 'capability' | 'starter' | 'blueprint';

export type PackageRequirement = {
  kind: string;
  label: string;
  name: string;
  id: string;
  secretRef: string;
};

export type PackageContribution = {
  kind: string;
  label: string;
  name: string;
  id: string;
  target: string;
};

export type PackageCharter = {
  mission: string;
  autonomyBounds: string[];
  metrics: string[];
};

export type PackageManifest = {
  id: string;
  name: string;
  version: string;
  scale: PackageScale;
  summary: string;
  itemType: PackageItemType;
  itemTypeLabel: string;
  stage: PackageStage;
  stageLabel: string;
  installTarget: string;
  requires: PackageRequirement[];
  contributes: PackageContribution[];
  config: Record<string, unknown>;
  seeds: Record<string, unknown>[];
  extends: string[];
  charter: PackageCharter;
  raw: Record<string, unknown>;
};

export type PackageListPage = {
  packages: PackageManifest[];
};

export type PackageListParams = {
  spaceId?: SpaceSelection;
};

function requireSpaceId(spaceId: SpaceSelection | undefined): string {
  const resolved = spaceId === undefined ? selectedSpaceFromEnvironment() : spaceId;
  if (!resolved) throw new Error('Packages API requires a selected Space.');
  return resolved;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function contributionLabel(kind: string): string {
  const labels: Record<string, string> = {
    loop_template: 'Loop',
    workflow_template: 'Workflow',
    skill: 'Skill',
    mcp_server: 'MCP server',
    agent_profile: 'Agent profile',
    blueprint: 'Blueprint',
    order_template: 'Order template',
    team_capability: 'Team capability',
    space_defaults: 'Space defaults',
    kit: 'Kit',
  };
  return labels[kind] || titleCase(kind);
}

function requirementLabel(kind: string): string {
  const labels: Record<string, string> = {
    secret_ref: 'Secret ref',
    package: 'Package',
    component: 'Component',
  };
  return labels[kind] || titleCase(kind);
}

function normalizeRequirement(raw: unknown): PackageRequirement {
  const item = recordValue(raw);
  const kind = stringValue(item.kind || 'requirement');
  return {
    kind,
    label: requirementLabel(kind),
    name: stringValue(item.name || item.id || item.package || item.secret_ref || item.secretRef || kind),
    id: stringValue(item.id || item.package || ''),
    secretRef: stringValue(item.secret_ref || item.secretRef || ''),
  };
}

function normalizeContribution(raw: unknown): PackageContribution {
  const item = recordValue(raw);
  const kind = stringValue(item.kind || 'contribution');
  return {
    kind,
    label: contributionLabel(kind),
    name: stringValue(item.name || item.target || item.package || item.id || kind),
    id: stringValue(item.id || item.package || ''),
    target: stringValue(item.target || ''),
  };
}

function itemTypeFrom(raw: Record<string, unknown>, contributes: PackageContribution[]): PackageItemType {
  const scale = stringValue(raw.scale);
  if (scale === 'blueprint') return 'blueprint';

  const config = recordValue(raw.config);
  const taxonomy = stringValue(config.taxonomy);
  if (taxonomy === 'loops') return 'loop';
  if (taxonomy === 'workflows') return 'workflow';
  if (taxonomy === 'skills') return 'skill';
  if (taxonomy === 'mcp_servers') return 'mcp_server';
  if (taxonomy === 'agent_profiles') return 'agent_profile';
  if (taxonomy === 'order_templates') return 'order_template';

  const kinds = contributes.map((item) => item.kind);
  if (kinds.includes('loop_template')) return 'loop';
  if (kinds.includes('workflow_template')) return 'workflow';
  if (kinds.includes('skill')) return 'skill';
  if (kinds.includes('mcp_server')) return 'mcp_server';
  if (kinds.includes('agent_profile')) return 'agent_profile';
  if (kinds.includes('order_template')) return 'order_template';
  if (scale === 'component') return 'component';
  return 'package';
}

export function packageItemTypeLabel(type: PackageItemType): string {
  const labels: Record<PackageItemType, string> = {
    loop: 'Loops',
    workflow: 'Workflows',
    skill: 'Skills',
    mcp_server: 'MCP servers',
    agent_profile: 'Agent profiles',
    blueprint: 'Blueprints',
    order_template: 'Order templates',
    component: 'Components',
    package: 'Packages',
  };
  return labels[type] || titleCase(type);
}

export function packageStageFor(manifest: Pick<PackageManifest, 'scale' | 'itemType'>): PackageStage {
  if (manifest.scale === 'blueprint' || manifest.itemType === 'blueprint') return 'blueprint';
  if (manifest.scale === 'component' || manifest.itemType === 'component') return 'foundation';
  if (manifest.itemType === 'skill' || manifest.itemType === 'mcp_server') return 'capability';
  return 'starter';
}

export function packageStageLabel(stage: PackageStage): string {
  const labels: Record<PackageStage, string> = {
    foundation: 'Foundation',
    capability: 'Capability',
    starter: 'Starter',
    blueprint: 'Blueprint',
  };
  return labels[stage] || titleCase(stage);
}

function installTargetFrom(raw: Record<string, unknown>): string {
  const config = recordValue(raw.config);
  return stringValue(config.install_target || config.component || config.taxonomy || '');
}

function normalizeCharter(raw: unknown): PackageCharter {
  const charter = recordValue(raw);
  return {
    mission: stringValue(charter.mission),
    autonomyBounds: arrayValue(charter.autonomy_bounds || charter.autonomyBounds).map(stringValue).filter(Boolean),
    metrics: arrayValue(charter.metrics).map(stringValue).filter(Boolean),
  };
}

export function normalizePackageManifest(raw: unknown): PackageManifest {
  const item = recordValue(raw);
  const contributes = arrayValue(item.contributes).map(normalizeContribution);
  const itemType = itemTypeFrom(item, contributes);
  const stage = packageStageFor({ scale: stringValue(item.scale), itemType });
  return {
    id: stringValue(item.id),
    name: stringValue(item.name || item.id),
    version: stringValue(item.version),
    scale: stringValue(item.scale),
    summary: stringValue(item.summary),
    itemType,
    itemTypeLabel: packageItemTypeLabel(itemType),
    stage,
    stageLabel: packageStageLabel(stage),
    installTarget: installTargetFrom(item),
    requires: arrayValue(item.requires).map(normalizeRequirement),
    contributes,
    config: recordValue(item.config),
    seeds: arrayValue(item.seeds).map((seed) => recordValue(seed)),
    extends: arrayValue(item.extends).map(stringValue).filter(Boolean),
    charter: normalizeCharter(item.charter),
    raw: item,
  };
}

function normalizePackageList(raw: unknown): PackageListPage {
  const list = Array.isArray(raw) ? raw : arrayValue(recordValue(raw).packages);
  return { packages: list.map(normalizePackageManifest) };
}

export function packageDetailHref(packageId: string): string {
  return `/market/${encodePathSegment(packageId)}`;
}

export function createPackagesApi(request: RequestFn, withQuery: WithQueryFn) {
  return {
    listCatalogPackages: async (): Promise<PackageListPage> =>
      normalizePackageList(await request<unknown>('/market/catalog')),
    listInstalledPackages: async (params: PackageListParams = {}): Promise<PackageListPage> =>
      normalizePackageList(await request<unknown>(withQuery('/market/installed', { space: requireSpaceId(params.spaceId) }))),
  };
}

export type PackagesApi = ReturnType<typeof createPackagesApi>;
