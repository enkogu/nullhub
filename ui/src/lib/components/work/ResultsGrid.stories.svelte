<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ResultsGrid from './ResultsGrid.svelte';
  import type { WorkResult } from './results';

  const { Story } = defineMeta({
    title: 'Work/ResultsGrid',
    component: ResultsGrid,
  });

  const nowMs = 1_780_000_000_000;

  const results: WorkResult[] = [
    {
      id: 'artifact:artifact-app-1',
      source: 'artifact',
      type: 'app',
      title: 'Support Portal',
      summary: 'The support portal app produced by the onboarding loop.',
      lifecycle: 'delivered',
      producedAtMs: nowMs - 30 * 60_000,
      app: { component: 'nullclaw', name: 'support-portal' },
      evidenceRef: 'run:loop-run-7',
    },
    {
      id: 'deliverable:task-doc-1',
      source: 'deliverable',
      type: 'document',
      title: 'Q2 onboarding playbook',
      summary: 'Draft playbook awaiting reviewer sign-off.',
      lifecycle: 'review',
      producedAtMs: nowMs - 2 * 60 * 60_000,
      evidenceRef: 'run:loop-run-3',
    },
    {
      id: 'artifact:artifact-link-1',
      source: 'artifact',
      type: 'link',
      title: 'Published landing page',
      summary: 'Approved landing page ready for the delivery handoff.',
      lifecycle: 'approved',
      producedAtMs: nowMs - 6 * 60 * 60_000,
      href: 'https://example.com/landing',
    },
    {
      id: 'deliverable:task-draft-1',
      source: 'deliverable',
      type: 'document',
      title: 'Outreach email draft',
      summary: 'The drafting loop is still iterating on this email.',
      lifecycle: 'draft',
      producedAtMs: nowMs - 10 * 60_000,
    },
  ];
</script>

{#snippet gridTemplate(args)}
  <div class="max-w-5xl">
    <ResultsGrid {...args} />
  </div>
{/snippet}

<Story name="Populated" args={{ results, gridState: 'ready', spaceId: 'ops', nowMs }} template={gridTemplate} />
<Story name="Loading" args={{ results: [], gridState: 'loading', nowMs }} template={gridTemplate} />
<Story name="Empty" args={{ results: [], gridState: 'ready', nowMs }} template={gridTemplate} />
<Story name="Requires Space" args={{ results: [], gridState: 'ready', requiresSpace: true, nowMs }} template={gridTemplate} />
<Story
  name="Error"
  args={{ results: [], gridState: 'error', error: 'Results unavailable.', nowMs }}
  template={gridTemplate}
/>
