import { describe, expect, test } from 'vitest';
import {
  cronHumanPreview,
  isValidCronExpression,
  orderBodySkeleton,
  orderDocumentToDraft,
  orderDraftToDocument,
  validateOrderEditorDraft,
  type OrderEditorDraft,
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
        title: 'Later trigger',
        body: orderBodySkeleton(),
      }),
    ).toMatchObject({ type: 'Trigger editors arrive in P5.' });
  });

  test('round-trips an order markdown document without losing draft fields', () => {
    const draft: OrderEditorDraft = {
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
    };

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
});
