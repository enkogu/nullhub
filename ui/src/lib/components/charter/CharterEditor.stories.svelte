<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { fixtureCharter } from '$lib/api/__fixtures__/charter';
  import CharterEditor from './CharterEditor.svelte';

  const { Story } = defineMeta({
    title: 'Charter/CharterEditor',
    component: CharterEditor,
  });

  const markerError = new Error('charter Markdown fields must not contain reserved NULLHUB charter markers') as Error & {
    status?: number;
  };
  markerError.status = 400;
</script>

{#snippet editorTemplate(args)}
  <div class="max-w-3xl rounded-lg border bg-card p-5">
    <CharterEditor {...args} onSave={async () => undefined} />
  </div>
{/snippet}

<Story name="Populated" args={{ charter: fixtureCharter }} template={editorTemplate} />
<Story name="Saving" args={{ charter: fixtureCharter, saving: true }} template={editorTemplate} />
<Story name="Backend error" args={{ charter: fixtureCharter, error: markerError }} template={editorTemplate} />
