import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import OrderEditor from './OrderEditor.svelte';
import { orderBodySkeleton, orderDocumentToDraft, orderDraftToDocument, type OrderEditorDraft } from './orders';

function textContent(container: HTMLElement): string {
  return container.textContent ?? '';
}

function setInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function clickType(container: HTMLElement, type: string) {
  container.querySelector<HTMLButtonElement>(`[data-order-type-card="${type}"]`)?.click();
}

test('renders type cards with trigger and mandate disabled until P5', async () => {
  const screen = await render(OrderEditor);

  await expect.element(screen.getByRole('button', { name: /Schedule/ })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Policy/ })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Trigger/ })).toBeDisabled();
  await expect.element(screen.getByRole('button', { name: /Mandate/ })).toBeDisabled();
  expect(screen.container.querySelectorAll('[data-order-type-card]:disabled')).toHaveLength(2);
});

test('validates schedule drafts and saves a valid cron document', async () => {
  const onSaveDraft = vi.fn();
  const screen = await render(OrderEditor, {
    props: {
      draft: { type: 'schedule', title: '', schedule: '', body: 'No sections yet.' },
      onSaveDraft,
    },
  });

  await screen.getByRole('button', { name: 'Save draft' }).click();
  await expect.element(screen.getByText('Title is required.')).toBeVisible();
  await expect.element(screen.getByText('Enter a valid five-field cron expression.')).toBeVisible();
  await expect.element(screen.getByText('Body must include WHEN, WHAT, and BOUNDS sections.')).toBeVisible();
  expect(onSaveDraft).not.toHaveBeenCalled();

  setInput(screen.container.querySelector<HTMLInputElement>('#order-editor-title')!, 'Morning brief');
  setInput(screen.container.querySelector<HTMLInputElement>('#order-editor-cron')!, '0 8 * * 1-5');
  setInput(screen.container.querySelector<HTMLTextAreaElement>('#order-editor-body')!, orderBodySkeleton());

  await screen.getByRole('button', { name: 'Save draft' }).click();
  await vi.waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
  expect(onSaveDraft.mock.calls[0][0]).toMatchObject({
    type: 'schedule',
    title: 'Morning brief',
    schedule: '0 8 * * 1-5',
  });
  expect(onSaveDraft.mock.calls[0][1]).toContain('schedule: "0 8 * * 1-5"');
  await expect.element(screen.getByText('Draft passed validation.')).toBeVisible();
});

test('validates policy agent scope separately from schedule cron', async () => {
  const onSaveDraft = vi.fn();
  const screen = await render(OrderEditor, {
    props: {
      draft: {
        type: 'policy',
        title: 'Outbound guardrails',
        policyAgentScope: '',
        body: orderBodySkeleton(),
      },
      onSaveDraft,
    },
  });

  await screen.getByRole('button', { name: 'Save draft' }).click();
  await expect.element(screen.getByText('Agent scope is required for a policy order.')).toBeVisible();
  expect(textContent(screen.container)).not.toContain('Enter a valid five-field cron expression.');

  setInput(screen.container.querySelector<HTMLInputElement>('#order-editor-agent-scope')!, 'Customer Success agents');
  await screen.getByRole('button', { name: 'Save draft' }).click();
  await vi.waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
  expect(onSaveDraft.mock.calls[0][0]).toMatchObject({
    type: 'policy',
    policyAgentScope: 'Customer Success agents',
  });
  expect(onSaveDraft.mock.calls[0][1]).toContain('agent_scope: "Customer Success agents"');

  clickType(screen.container, 'schedule');
  await expect.element(screen.getByLabelText('Raw cron')).toBeVisible();
});

test('shows autonomy warning and approve-and-enact bar for ai_decision drafts', async () => {
  const onApprove = vi.fn();
  const screen = await render(OrderEditor, {
    props: {
      draft: {
        type: 'schedule',
        source: 'ai_decision',
        title: 'Follow up on stale onboarding',
        schedule: '0 9 * * 1',
        autonomyTier: 'T3',
        body: orderBodySkeleton(),
      },
      onApproveAndEnact: onApprove,
    },
  });

  await expect.element(screen.getByText('AI decision draft')).toBeVisible();
  await expect.element(screen.getByText('T3 warning:', { exact: false })).toBeVisible();
  screen.container.querySelector<HTMLButtonElement>('[data-slot="order-editor-ai-decision-bar"] button')?.click();
  await vi.waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
  expect(onApprove.mock.calls[0][0]).toMatchObject({ source: 'ai_decision', autonomyTier: 'T3' });
});

test('keeps order document round-trip lossless for editor drafts', () => {
  const draft: OrderEditorDraft = {
    type: 'policy',
    source: 'ai_decision',
    title: 'Customer outreach policy',
    summary: 'Guard outbound claims.',
    schedule: '0 9 * * 1-5',
    cronPresetId: 'weekday-0900',
    policyAgentScope: 'Revenue agents',
    autonomyTier: 'T2',
    body: `## WHEN
- An agent contacts a customer.

## WHAT
- Keep claims factual.

## BOUNDS
- Ask before discounts.
`,
  };
  const document = orderDraftToDocument(draft);

  expect(orderDraftToDocument(orderDocumentToDraft(document))).toBe(document);
});
