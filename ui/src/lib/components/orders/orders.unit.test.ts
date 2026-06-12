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
  test('previews cron presets and rejects malformed expressions', () => {
    expect(cronHumanPreview('0 9 * * 1-5')).toBe('Every weekday at 09:00');
    expect(cronHumanPreview('0 18 * * *')).toBe('Every day at 18:00');
    expect(cronHumanPreview('tomorrow')).toBe('Enter a five-field cron expression.');
    expect(isValidCronExpression('0 9 * * 1-5')).toBe(true);
    expect(isValidCronExpression('tomorrow')).toBe(false);
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
