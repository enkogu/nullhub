<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import LiveRunsFeed from './LiveRunsFeed.svelte';
  import type { LiveRun } from './live';

  const { Story } = defineMeta({
    title: 'Work/LiveRunsFeed',
    component: LiveRunsFeed,
  });

  const nowMs = 1_780_000_000_000;
  const runs: LiveRun[] = [
    {
      id: 'loop:loop-42',
      source: 'loop',
      title: 'Support Triage',
      summary: 'Athena is reviewing inbound support requests.',
      owner: 'Athena',
      ownerLabel: 'Agent',
      status: 'running',
      bucket: 'active',
      surfaceLabel: 'Work evidence',
      startedAtMs: nowMs - 7 * 60_000,
      updatedAtMs: nowMs - 60_000,
      durationMs: 6 * 60_000,
      attempt: 1,
      watchState: 'observed',
      stalled: false,
    },
    {
      id: 'workflow:workflow-17',
      source: 'workflow',
      title: 'Onboarding Graph',
      summary: 'The onboarding workflow is waiting on a graph node.',
      owner: 'boiler',
      ownerLabel: 'Worker',
      status: 'running',
      bucket: 'stalled',
      surfaceLabel: 'Graph execution',
      startedAtMs: nowMs - 22 * 60_000,
      updatedAtMs: nowMs - 21 * 60_000,
      durationMs: 21 * 60_000,
      evidenceRef: 'trace-17',
      watchState: 'unobserved',
      stalled: true,
      stallReason: 'Active run is not visible in the selected NullWatch stream.',
    },
    {
      id: 'agent:Athena',
      source: 'agent',
      title: 'Draft response',
      summary: 'Athena is working on the customer response.',
      owner: 'Athena',
      ownerLabel: 'Agent',
      status: 'running',
      bucket: 'active',
      surfaceLabel: 'Agent work',
      startedAtMs: nowMs - 3 * 60_000,
      updatedAtMs: nowMs - 20_000,
      durationMs: 160_000,
      watchState: 'unavailable',
      stalled: false,
    },
  ];
</script>

{#snippet feedTemplate(args)}
  <div class="max-w-5xl">
    <LiveRunsFeed {...args} />
  </div>
{/snippet}

<Story name="Populated" args={{ runs, feedState: 'ready', nowMs }} template={feedTemplate} />
<Story name="Loading" args={{ runs: [], feedState: 'loading', nowMs }} template={feedTemplate} />
<Story name="Empty" args={{ runs: [], feedState: 'ready', nowMs }} template={feedTemplate} />
<Story name="Requires Space" args={{ runs: [], feedState: 'ready', requiresSpace: true, nowMs }} template={feedTemplate} />
<Story
  name="Error"
  args={{ runs: [], feedState: 'error', error: 'Live runs unavailable.', nowMs }}
  template={feedTemplate}
/>
