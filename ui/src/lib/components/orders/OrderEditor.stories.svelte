<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import OrderEditor from './OrderEditor.svelte';
  import { orderBodySkeleton, type OrderEditorDraft } from './orders';

  const { Story } = defineMeta({
    title: 'Orders/OrderEditor',
    component: OrderEditor,
  });

  const scheduleDraft: Partial<OrderEditorDraft> = {
    type: 'schedule',
    title: 'Morning operations brief',
    summary: 'Prepare the daily operating snapshot.',
    schedule: '0 9 * * 1-5',
    autonomyTier: 'T1',
    body: orderBodySkeleton(),
  };

  const policyDraft: Partial<OrderEditorDraft> = {
    type: 'policy',
    title: 'Customer outreach guardrails',
    summary: 'Limit outbound customer messaging.',
    policyAgentScope: 'Customer Success agents',
    autonomyTier: 'T2',
    body: `## WHEN
- Any agent prepares outbound customer messaging.

## WHAT
- Keep language direct and factual.
- Escalate pricing, refunds, and legal claims.

## BOUNDS
- No discounts without approval.
- No legal commitments.
`,
  };

  const aiDecisionDraft: Partial<OrderEditorDraft> = {
    ...scheduleDraft,
    source: 'ai_decision',
    title: 'Follow up on stalled onboarding',
    summary: 'AI-proposed schedule for stale onboarding accounts.',
  };

  const invalidDraft: Partial<OrderEditorDraft> = {
    type: 'schedule',
    title: '',
    schedule: 'tomorrow',
    body: 'Follow up later.',
  };
</script>

{#snippet editorTemplate(args)}
  <div class="max-w-7xl">
    <OrderEditor {...args} />
  </div>
{/snippet}

<Story name="Schedule" args={{ draft: scheduleDraft }} template={editorTemplate} />
<Story name="Policy" args={{ draft: policyDraft }} template={editorTemplate} />
<Story name="AI Decision Draft" args={{ draft: aiDecisionDraft }} template={editorTemplate} />
<Story name="Validation" args={{ draft: invalidDraft }} template={editorTemplate} />
