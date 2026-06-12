import { describe, expect, test } from 'vitest';
import {
  promotedLoopOrderDocument,
  promotedLoopOrderInput,
  promotedOrderHref,
} from './promoteOrder';
import type { LoopSummary } from './types';

const loop: LoopSummary = {
  pipeline: {
    id: 'pipeline-support',
    name: 'Support Triage',
    definition: {
      loop: {
        slug: 'support-triage',
        source: 'builtin',
        category: 'Support',
        machine: 'Support Machine',
        goal: 'Every request has an owner and next action.',
        exit_condition: 'All inbound requests are assigned.',
      },
    },
  },
  meta: {
    slug: 'support-triage',
    source: 'builtin',
    category: 'Support',
    machine: 'Support Machine',
    goal: 'Every request has an owner and next action.',
    exit_condition: 'All inbound requests are assigned.',
  },
  waiting: 2,
  active: 1,
  attention: 0,
  done: 5,
  lastRow: null,
};

describe('Loop to Order promotion helpers', () => {
  test('builds a loop order create input with durable context', () => {
    const input = promotedLoopOrderInput(loop, 'ops');

    expect(input).toMatchObject({
      spaceId: 'ops',
      title: 'Support Triage',
      summary: 'Every request has an owner and next action.',
      kind: 'loop',
      schedule: '',
    });
    expect(input.content).toContain('kind: "loop"');
    expect(input.content).toContain('loop_id: "pipeline-support"');
    expect(input.content).toContain('loop_slug: "support-triage"');
    expect(input.content).toContain('## WHEN');
    expect(input.content).toContain('## WHAT');
    expect(input.content).toContain('## BOUNDS');
  });

  test('falls back to pipeline name when no Loop metadata exists', () => {
    const document = promotedLoopOrderDocument({
      ...loop,
      pipeline: { id: 'pipeline-custom', name: 'Weekly Closeout', definition: {} },
      meta: null,
    });

    expect(document).toContain('title: "Weekly Closeout"');
    expect(document).toContain('Run the installed Loop `Weekly Closeout`.');
  });

  test('builds order detail links with the selected Space preserved', () => {
    expect(promotedOrderHref({ id: 'order 1' }, 'ops')).toBe('/orders/order%201?space=ops');
    expect(promotedOrderHref({ id: 'order-2' }, null)).toBe('/orders/order-2');
  });
});
