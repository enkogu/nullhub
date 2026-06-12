<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ResultLifecycleBadge from './ResultLifecycleBadge.svelte';
  import { resultLifecycles } from './results';

  const { Story } = defineMeta({
    title: 'Work/ResultLifecycleBadge',
    component: ResultLifecycleBadge,
  });
</script>

<Story name="Draft" args={{ lifecycle: 'draft' }} />
<Story name="In Review" args={{ lifecycle: 'review' }} />
<Story name="Approved" args={{ lifecycle: 'approved' }} />
<Story name="Delivered" args={{ lifecycle: 'delivered' }} />

{#snippet allTemplate()}
  <div class="flex flex-wrap gap-2">
    {#each resultLifecycles as lifecycle (lifecycle)}
      <ResultLifecycleBadge {lifecycle} />
    {/each}
  </div>
{/snippet}

<Story name="All Lifecycles" template={allTemplate} />
