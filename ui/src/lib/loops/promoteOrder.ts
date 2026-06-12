import type { Order, OrderCreateInput } from '$lib/api/orders';
import type { SpaceSelection } from '$lib/api/spaces';
import type { LoopSummary } from '$lib/loops/types';

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function loopGoal(loop: LoopSummary): string {
  return clean(loop.meta?.goal || loop.pipeline.definition?.states?.todo?.description);
}

function loopExitCondition(loop: LoopSummary): string {
  return clean(loop.meta?.exit_condition || 'The Loop reaches its exit state with review evidence attached.');
}

function loopTitle(loop: LoopSummary): string {
  return clean(loop.pipeline.name || loop.meta?.slug || loop.pipeline.id) || 'Loop';
}

function promotedOrderSummary(loop: LoopSummary): string {
  const goal = loopGoal(loop);
  return goal || `Run ${loopTitle(loop)} as a durable Loop order.`;
}

export function promotedLoopOrderDocument(loop: LoopSummary): string {
  const title = loopTitle(loop);
  const goal = loopGoal(loop);
  const exitCondition = loopExitCondition(loop);
  const source = clean(loop.meta?.source || 'installed');
  const category = clean(loop.meta?.category);
  const machine = clean(loop.meta?.machine);
  const frontmatter: Record<string, string> = {
    kind: 'loop',
    source: 'loop_promote',
    title,
    summary: promotedOrderSummary(loop),
    loop_id: clean(loop.pipeline.id),
    loop_name: clean(loop.pipeline.name),
    loop_source: source,
  };
  if (clean(loop.meta?.slug)) frontmatter.loop_slug = clean(loop.meta?.slug);
  if (category) frontmatter.loop_category = category;
  if (machine) frontmatter.loop_machine = machine;

  const frontmatterLines = Object.entries(frontmatter).map(
    ([key, value]) => `${key}: ${yamlScalar(value)}`,
  );
  const goalLines = goal
    ? [`- Run the installed Loop \`${title}\`.`, `- Goal: ${goal}`]
    : [`- Run the installed Loop \`${title}\`.`];

  return `---\n${frontmatterLines.join('\n')}\n---\n## WHEN\n- Start this order when the repeat should run for the selected Space.\n\n## WHAT\n${goalLines.join('\n')}\n- Exit condition: ${exitCondition}\n\n## BOUNDS\n- Use the existing Loop definition and ticket-backed runtime.\n- Preserve the Loop review and evidence expectations before treating the work as complete.\n`;
}

export function promotedLoopOrderInput(loop: LoopSummary, spaceId: SpaceSelection): OrderCreateInput {
  const title = loopTitle(loop);
  return {
    spaceId,
    title,
    summary: promotedOrderSummary(loop),
    kind: 'loop',
    schedule: '',
    content: promotedLoopOrderDocument(loop),
  };
}

export function promotedOrderHref(order: Pick<Order, 'id'>, spaceId: SpaceSelection): string {
  const params = new URLSearchParams();
  if (spaceId) params.set('space', spaceId);
  const query = params.toString();
  return `/orders/${encodeURIComponent(order.id)}${query ? `?${query}` : ''}`;
}
