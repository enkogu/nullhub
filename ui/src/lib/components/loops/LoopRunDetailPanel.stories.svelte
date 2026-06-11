<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import LoopRunCheckOutput from './LoopRunCheckOutput.svelte';
  import LoopRunDetailPanel from './LoopRunDetailPanel.svelte';
  import type { LoopRunDetailData, LoopRunDetailEntry } from './loopRunDetail';

  const { Story } = defineMeta({
    title: 'Loops/LoopRunDetailPanel',
    component: LoopRunDetailPanel,
  });

  const entry: LoopRunDetailEntry = {
    task: {
      id: 'task-loop-1',
      pipeline_id: 'support-triage',
      stage: 'done',
      title: 'Triage support inbox',
      description: 'Review incoming support requests and assign owners.',
      priority: 60,
      created_at_ms: 1_780_000_000_000,
    },
    run: {
      id: 'loop-run-1',
      task_id: 'task-loop-1',
      status: 'completed',
      attempt: 2,
      agent_id: 'nullclaw-Athena',
      started_at_ms: 1_780_000_000_000,
      ended_at_ms: 1_780_000_180_000,
    },
    pipeline: {
      id: 'support-triage',
      name: 'Support Triage',
    },
  };

  const waitingEntry: LoopRunDetailEntry = {
    task: {
      id: 'task-waiting',
      pipeline_id: 'support-triage',
      stage: 'queued',
      title: 'Queued outreach',
      priority: 50,
      created_at_ms: 1_780_000_000_000,
    },
    pipeline: entry.pipeline,
  };

  const detail: LoopRunDetailData = {
    events: [
      { id: 1, run_id: 'loop-run-1', ts_ms: 1_780_000_010_000, kind: 'claimed', data: { worker_id: 'nullclaw-Athena' } },
      {
        id: 2,
        run_id: 'loop-run-1',
        ts_ms: 1_780_000_020_000,
        kind: 'check_completed',
        data: { check_output: 'All requests have owners.', usage: { total_tokens: 1210, cost_usd: 0.0042 } },
      },
      {
        id: 3,
        run_id: 'loop-run-1',
        ts_ms: 1_780_000_030_000,
        kind: 'judge_decision',
        data: { decision: 'approved', reason: 'The exit condition is satisfied.', judge: 'Iris' },
      },
    ],
    artifacts: [
      {
        id: 'artifact-1',
        task_id: 'task-loop-1',
        run_id: 'loop-run-1',
        created_at_ms: 1_780_000_040_000,
        kind: 'report',
        uri: 'artifact://loop-run-1/report.md',
        size_bytes: 2048,
        meta: {},
      },
    ],
  };
</script>

{#snippet panelTemplate(args)}
  <div class="max-w-4xl">
    <LoopRunDetailPanel {...args} />
  </div>
{/snippet}

{#snippet checkTemplate(args)}
  <div class="max-w-4xl">
    <LoopRunCheckOutput {...args} />
  </div>
{/snippet}

<Story name="Populated" args={{ entry, detail }} template={panelTemplate} />
<Story name="Waiting" args={{ entry: waitingEntry, detail: { events: [], artifacts: [] } }} template={panelTemplate} />
<Story name="Empty Check Output" args={{ detail: { events: [], artifacts: [] } }} template={checkTemplate} />
