import type { PackageManifest, PackageStage } from '$lib/api/packages';

export const marketTypeOptions = [
  { label: 'Loops', value: 'loop' },
  { label: 'Workflows', value: 'workflow' },
  { label: 'Skills', value: 'skill' },
  { label: 'MCP servers', value: 'mcp_server' },
  { label: 'Agent profiles', value: 'agent_profile' },
  { label: 'Blueprints', value: 'blueprint' },
  { label: 'Order templates', value: 'order_template' },
  { label: 'Components', value: 'component' },
];

export const marketScaleOptions = [
  { label: 'Component', value: 'component' },
  { label: 'Kit', value: 'kit' },
  { label: 'Blueprint', value: 'blueprint' },
];

export const marketStageOptions = [
  { label: 'Foundation', value: 'foundation' },
  { label: 'Capability', value: 'capability' },
  { label: 'Starter', value: 'starter' },
  { label: 'Blueprint', value: 'blueprint' },
];

export type MarketFilters = {
  query: string;
  type: string;
  scale: string;
  stage: string;
};

export function defaultMarketFilters(): MarketFilters {
  return { query: '', type: '', scale: '', stage: '' };
}

export function filterMarketPackages(packages: PackageManifest[], filters: MarketFilters): PackageManifest[] {
  const query = filters.query.trim().toLowerCase();
  return packages.filter((pkg) => {
    if (filters.type && pkg.itemType !== filters.type) return false;
    if (filters.scale && pkg.scale !== filters.scale) return false;
    if (filters.stage && pkg.stage !== filters.stage) return false;
    if (!query) return true;
    const searchable = [
      pkg.id,
      pkg.name,
      pkg.summary,
      pkg.itemTypeLabel,
      pkg.stageLabel,
      pkg.scale,
      ...pkg.contributes.map((item) => `${item.label} ${item.name}`),
      ...pkg.requires.map((item) => `${item.label} ${item.name} ${item.secretRef}`),
    ].join(' ').toLowerCase();
    return searchable.includes(query);
  });
}

export function packageContributesSummary(pkg: PackageManifest): string {
  if (pkg.contributes.length === 0) return 'No installable contributions declared.';
  const visible = pkg.contributes.slice(0, 3).map((item) => item.name || item.label);
  const suffix = pkg.contributes.length > visible.length ? ` +${pkg.contributes.length - visible.length} more` : '';
  return `${visible.join(', ')}${suffix}`;
}

export function packageRequirementSummary(pkg: PackageManifest): string {
  if (pkg.requires.length === 0) return 'No prerequisites declared.';
  const secretCount = pkg.requires.filter((item) => item.kind === 'secret_ref').length;
  const packageCount = pkg.requires.filter((item) => item.kind === 'package').length;
  const componentCount = pkg.requires.filter((item) => item.kind === 'component').length;
  const parts = [
    secretCount ? `${secretCount} secret ${secretCount === 1 ? 'ref' : 'refs'}` : '',
    packageCount ? `${packageCount} package ${packageCount === 1 ? 'dependency' : 'dependencies'}` : '',
    componentCount ? `${componentCount} component ${componentCount === 1 ? 'dependency' : 'dependencies'}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : `${pkg.requires.length} prerequisite${pkg.requires.length === 1 ? '' : 's'}`;
}

export function packageBlastRadius(pkg: PackageManifest): string {
  const seedCount = pkg.seeds.length;
  const contributionCount = pkg.contributes.length;
  const extensionCount = pkg.extends.length;
  const installTarget = pkg.installTarget ? ` targeting ${pkg.installTarget}` : '';
  return `${contributionCount} contribution${contributionCount === 1 ? '' : 's'}, ${seedCount} seed${seedCount === 1 ? '' : 's'}, ${extensionCount} extension${extensionCount === 1 ? '' : 's'}${installTarget}`;
}

export function stageRecommendation(stage: PackageStage): string {
  if (stage === 'foundation') return 'Start here when the Space needs a managed agent runtime before higher-level packages.';
  if (stage === 'capability') return 'Add this after a runtime exists and the required provider or tool references are available.';
  if (stage === 'starter') return 'Use this to seed repeatable work patterns once the foundation is installed.';
  return 'Apply this when the Space needs an opinionated bundle of defaults and starter content.';
}
