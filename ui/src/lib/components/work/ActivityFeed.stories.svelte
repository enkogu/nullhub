<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ActivityFeed from './ActivityFeed.svelte';
  import type { NullHubEvent } from '$lib/api/client';

  const { Story } = defineMeta({
    title: 'Work/ActivityFeed',
    component: ActivityFeed,
  });

  const nowMs = 1_780_000_000_000;
  const events: NullHubEvent[] = [
    {
      id: 4,
      spaceId: 'ops',
      type: 'loop.review_requested',
      source: 'nulltickets',
      subjectType: 'loop_run',
      subjectId: 'loop-42',
      title: 'Review requested',
      summary: 'Athena finished a support triage loop and needs approval.',
      severity: 'warning',
      evidenceRef: 'artifact://loop-42',
      createdAtMs: nowMs - 5 * 60_000,
      payload: { agent: 'Athena' },
    },
    {
      id: 3,
      spaceId: 'ops',
      type: 'workflow.completed',
      source: 'nullboiler',
      subjectType: 'workflow_run',
      subjectId: 'workflow-17',
      title: 'Workflow completed',
      summary: 'The onboarding workflow produced its deliverable package.',
      severity: 'success',
      evidenceRef: 'artifact://workflow-17',
      createdAtMs: nowMs - 25 * 60_000,
      payload: { agent: 'Iris' },
    },
    {
      id: 2,
      spaceId: 'ops',
      type: 'agent.note',
      source: 'dispatcher',
      subjectType: 'task',
      subjectId: 'task-19',
      title: 'Agent note captured',
      summary: 'Dispatcher recorded a progress update for an active task.',
      severity: 'info',
      evidenceRef: '',
      createdAtMs: nowMs - 3 * 60 * 60_000,
      payload: { agent: 'Athena' },
    },
  ];
</script>

{#snippet feedTemplate(args)}
  <div class="max-w-5xl">
    <ActivityFeed {...args} />
  </div>
{/snippet}

<Story name="Populated" args={{ events, feedState: 'ready', nowMs }} template={feedTemplate} />
<Story name="Loading" args={{ events: [], feedState: 'loading', nowMs }} template={feedTemplate} />
<Story name="Empty" args={{ events: [], feedState: 'ready', nowMs }} template={feedTemplate} />
<Story
  name="Error"
  args={{ events: [], feedState: 'error', error: 'Events unavailable.', nowMs }}
  template={feedTemplate}
/>
