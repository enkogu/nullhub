<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { fixtureCharter } from '$lib/api/__fixtures__/charter';
  import CharterCard from './CharterCard.svelte';

  const { Story } = defineMeta({
    title: 'Charter/CharterCard',
    component: CharterCard,
  });

  const emptyCharter = {
    spaceId: 'ops',
    stage: 'draft',
    mission: '',
    autonomyBounds: '',
    autonomyDefaults: 'T1',
    metrics: '',
    docPath: 'charter.md',
  };
</script>

{#snippet cardTemplate(args)}
  <div class="max-w-2xl">
    <CharterCard {...args} onSave={async () => undefined} />
  </div>
{/snippet}

<Story name="Populated" args={{ charter: fixtureCharter, state: 'ready', spaceName: 'Operations' }} template={cardTemplate} />
<Story name="Loading" args={{ charter: null, state: 'loading', spaceName: 'Operations' }} template={cardTemplate} />
<Story name="Empty" args={{ charter: emptyCharter, state: 'ready', spaceName: 'Operations' }} template={cardTemplate} />
<Story
  name="Error"
  args={{ charter: null, state: 'error', error: new Error('Charter API unavailable.'), spaceName: 'Operations' }}
  template={cardTemplate}
/>
