<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import EventRow from './EventRow.svelte';
  import type { NullHubEvent } from '$lib/api/client';

  const { Story } = defineMeta({
    title: 'Work/EventRow',
    component: EventRow,
  });

  const nowMs = 1_780_000_000_000;

  function event(severity: string, id: number): NullHubEvent {
    return {
      id,
      spaceId: 'ops',
      type: `work.${severity}`,
      source: id % 2 ? 'nulltickets' : 'nullboiler',
      subjectType: id % 2 ? 'loop_run' : 'workflow_run',
      subjectId: `run-${id}`,
      title: `${severity} event`,
      summary: 'Agent work produced an activity event with evidence attached.',
      severity,
      evidenceRef: `artifact://run-${id}`,
      createdAtMs: nowMs - id * 60_000,
      payload: { agent: id % 2 ? 'Athena' : 'Iris' },
    };
  }
</script>

{#snippet rowTemplate(args)}
  <div class="max-w-3xl">
    <EventRow {...args} />
  </div>
{/snippet}

<Story name="Info" args={{ event: event('info', 1), nowMs }} template={rowTemplate} />
<Story name="Success" args={{ event: event('success', 2), nowMs }} template={rowTemplate} />
<Story name="Warning" args={{ event: event('warning', 3), nowMs }} template={rowTemplate} />
<Story name="Error" args={{ event: event('error', 4), nowMs }} template={rowTemplate} />
