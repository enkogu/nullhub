<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as Kbd from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Kbd',
		component: Kbd.Root
	});
</script>

{#snippet singleTemplate()}
	<Kbd.Root>Esc</Kbd.Root>
{/snippet}

{#snippet groupTemplate()}
	<Kbd.Group>
		<Kbd.Root>Ctrl</Kbd.Root>
		<span class="text-muted-foreground">+</span>
		<Kbd.Root>K</Kbd.Root>
	</Kbd.Group>
{/snippet}

{#snippet inlineTemplate()}
	<p class="text-muted-foreground text-sm">
		Open command search with
		<Kbd.Group class="mx-1">
			<Kbd.Root>Ctrl</Kbd.Root>
			<Kbd.Root>K</Kbd.Root>
		</Kbd.Group>
	</p>
{/snippet}

<Story name="Single" template={singleTemplate} />
<Story name="Group" template={groupTemplate} />
<Story name="Inline" template={inlineTemplate} />
