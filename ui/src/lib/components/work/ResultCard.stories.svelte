<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ResultCard from './ResultCard.svelte';
  import type { WorkResult } from './results';

  const { Story } = defineMeta({
    title: 'Work/ResultCard',
    component: ResultCard,
  });

  const nowMs = 1_780_000_000_000;

  const deliveredApp: WorkResult = {
    id: 'artifact:artifact-app-1',
    source: 'artifact',
    type: 'app',
    title: 'Support Portal',
    summary: 'The support portal app produced by the onboarding loop.',
    lifecycle: 'delivered',
    producedAtMs: nowMs - 30 * 60_000,
    app: { component: 'nullclaw', name: 'support-portal' },
    evidenceRef: 'run:loop-run-7',
  };

  const reviewDocument: WorkResult = {
    id: 'deliverable:task-doc-1',
    source: 'deliverable',
    type: 'document',
    title: 'Q2 onboarding playbook',
    summary: 'Draft playbook awaiting reviewer sign-off.',
    lifecycle: 'review',
    producedAtMs: nowMs - 2 * 60 * 60_000,
    evidenceRef: 'run:loop-run-3',
  };

  const approvedLink: WorkResult = {
    id: 'artifact:artifact-link-1',
    source: 'artifact',
    type: 'link',
    title: 'Published landing page',
    summary: 'Approved landing page ready for the delivery handoff.',
    lifecycle: 'approved',
    producedAtMs: nowMs - 6 * 60 * 60_000,
    href: 'https://example.com/landing',
  };

  const draftFile: WorkResult = {
    id: 'artifact:artifact-file-1',
    source: 'artifact',
    type: 'file',
    title: 'export.csv',
    summary: 'Raw export captured during the latest run.',
    lifecycle: 'draft',
    producedAtMs: nowMs - 20 * 60_000,
  };
</script>

{#snippet cardTemplate(args)}
  <div class="max-w-md">
    <ResultCard {...args} />
  </div>
{/snippet}

<Story name="Delivered App" args={{ result: deliveredApp, spaceId: 'ops', nowMs }} template={cardTemplate} />
<Story name="In Review Document" args={{ result: reviewDocument, nowMs }} template={cardTemplate} />
<Story name="Approved Link" args={{ result: approvedLink, nowMs }} template={cardTemplate} />
<Story name="Draft File" args={{ result: draftFile, nowMs }} template={cardTemplate} />
