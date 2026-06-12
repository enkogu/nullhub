import { describe, expect, test } from 'vitest';
import {
  cronHumanPreview,
  isValidCronExpression,
  normalizeOrderEditorDraft,
  orderBodySkeleton,
  orderDocumentToDraft,
  orderDraftToOrderInput,
  orderDraftToDocument,
  validateOrderEditorDraft,
} from './orders';

describe('order editor helpers', () => {
  test('previews cron presets and validates cron field ranges', () => {
    expect(cronHumanPreview('0 9 * * 1-5')).toBe('Every weekday at 09:00');
    expect(cronHumanPreview('0 18 * * *')).toBe('Every day at 18:00');
    expect(cronHumanPreview('tomorrow')).toBe('Enter a five-field cron expression.');
    expect(cronHumanPreview('99 99 * * *')).toBe('Enter a five-field cron expression.');
    expect(isValidCronExpression('0 9 * * 1-5')).toBe(true);
    expect(isValidCronExpression('59 23 31 12 7')).toBe(true);
    expect(isValidCronExpression('*/15 0-23/2 1,15,31 1-12 0,6')).toBe(true);
    expect(isValidCronExpression('tomorrow')).toBe(false);
    expect(isValidCronExpression('99 99 * * *')).toBe(false);
    expect(isValidCronExpression('60 0 * * *')).toBe(false);
    expect(isValidCronExpression('0 24 * * *')).toBe(false);
    expect(isValidCronExpression('0 0 0 * *')).toBe(false);
    expect(isValidCronExpression('0 0 * 13 *')).toBe(false);
    expect(isValidCronExpression('0 0 * * 8')).toBe(false);
    expect(isValidCronExpression('*/0 * * * *')).toBe(false);
    expect(isValidCronExpression('5-1 * * * *')).toBe(false);
    expect(isValidCronExpression('1,,2 * * * *')).toBe(false);
  });

  test('validates schedule and policy drafts by type', () => {
    expect(
      validateOrderEditorDraft({
        type: 'schedule',
        title: 'Morning brief',
        schedule: 'bad cron',
        body: orderBodySkeleton(),
      }),
    ).toMatchObject({ schedule: 'Enter a valid five-field cron expression.' });

    expect(
      validateOrderEditorDraft({
        type: 'policy',
        title: 'Outbound limits',
        policyAgentScope: '',
        body: orderBodySkeleton(),
      }),
    ).toMatchObject({ policyAgentScope: 'Agent scope is required for a policy order.' });

    expect(
      validateOrderEditorDraft({
        type: 'trigger',
        title: 'Ticket trigger',
      }),
    ).toMatchObject({ triggerEventType: 'Event type is required for a trigger order.' });

    expect(
      validateOrderEditorDraft({
        type: 'mandate',
        title: 'Subscriber mandate',
        mandateConditionEventType: 'subscribers.goal_met',
      }),
    ).toMatchObject({ mandateGoal: 'Goal is required for a mandate order.' });
  });

  test('round-trips an order markdown document without losing draft fields', () => {
    const draft = normalizeOrderEditorDraft({
      type: 'policy',
      source: 'ai_decision',
      title: 'Customer outreach guardrails',
      summary: 'Keep outbound messaging inside policy.',
      schedule: '0 9 * * 1-5',
      cronPresetId: 'weekday-0900',
      policyAgentScope: 'Customer Success agents',
      autonomyTier: 'T2',
      body: `## WHEN
- A customer-facing agent writes outbound copy.

## WHAT
- Keep claims factual.

## BOUNDS
- Ask before discounts or legal language.
`,
    });

    const document = orderDraftToDocument(draft);
    const parsed = orderDocumentToDraft(document);

    expect(parsed).toMatchObject({
      type: draft.type,
      source: draft.source,
      title: draft.title,
      summary: draft.summary,
      policyAgentScope: draft.policyAgentScope,
      autonomyTier: draft.autonomyTier,
      body: draft.body,
    });
    expect(orderDraftToDocument(parsed)).toBe(document);
  });

  test('serializes trigger drafts to dispatcher JSON content', () => {
    const draft = normalizeOrderEditorDraft({
      type: 'trigger',
      title: 'Ticket created dispatcher',
      summary: 'Create work when a ticket appears.',
      triggerEventType: 'work.ticket.created',
      triggerSource: 'nulltickets',
      triggerSubjectType: 'ticket',
      actionType: 'create_ticket',
      actionTarget: 'triage',
      actionInstructions: 'Open a triage ticket.',
      autonomyTier: 'T2',
    });

    const document = orderDraftToDocument(draft);
    const parsed = orderDocumentToDraft(document);
    const input = orderDraftToOrderInput(draft);

    expect(JSON.parse(document)).toMatchObject({
      trigger: { event_type: 'work.ticket.created', source: 'nulltickets', subject_type: 'ticket' },
      tier: 'T2',
      action: { type: 'create_ticket', target: 'triage', instructions: 'Open a triage ticket.' },
    });
    expect(parsed).toMatchObject({
      type: 'trigger',
      triggerEventType: 'work.ticket.created',
      triggerSource: 'nulltickets',
      actionType: 'create_ticket',
    });
    expect(input).toMatchObject({
      kind: 'trigger',
      goal: '',
      schedule: 'event:work.ticket.created',
      content: document,
    });
  });

  test('serializes mandate drafts with goal, condition, cadence, and action fields', () => {
    const draft = normalizeOrderEditorDraft({
      type: 'mandate',
      title: 'Subscriber goal mandate',
      summary: 'Keep subscriber follow-up current.',
      mandateGoal: 'subscribers-50',
      mandateConditionEventType: 'subscribers.goal_met',
      mandateUnmetEventType: 'subscribers.goal_unmet',
      mandateCheckCadenceMs: 120000,
      actionType: 'run_agent',
      actionTarget: 'growth-agent',
      actionInstructions: 'Continue outreach until the goal is met.',
      autonomyTier: 'T1',
    });

    const document = orderDraftToDocument(draft);
    const parsed = orderDocumentToDraft(document);
    const input = orderDraftToOrderInput(draft);

    expect(JSON.parse(document)).toMatchObject({
      goal: 'subscribers-50',
      condition: {
        event_type: 'subscribers.goal_met',
        unmet_event_type: 'subscribers.goal_unmet',
      },
      check_cadence_ms: 120000,
      action: {
        type: 'run_agent',
        target: 'growth-agent',
        instructions: 'Continue outreach until the goal is met.',
      },
    });
    expect(parsed).toMatchObject({
      type: 'mandate',
      mandateGoal: 'subscribers-50',
      mandateConditionEventType: 'subscribers.goal_met',
      mandateCheckCadenceMs: 120000,
    });
    expect(input).toMatchObject({
      kind: 'mandate',
      goal: 'subscribers-50',
      schedule: '',
      content: document,
    });
  });
});
