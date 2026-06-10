<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Skeleton } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Skeleton',
		component: Skeleton
	});
</script>

{#snippet textTemplate()}
	<div class="w-72 space-y-2">
		<Skeleton class="h-4 w-48" />
		<Skeleton class="h-4 w-64" />
		<Skeleton class="h-4 w-40" />
	</div>
{/snippet}

{#snippet cardTemplate()}
	<div class="w-72 space-y-4 rounded-md border p-4">
		<Skeleton class="h-24 w-full" />
		<div class="space-y-2">
			<Skeleton class="h-4 w-44" />
			<Skeleton class="h-4 w-56" />
		</div>
	</div>
{/snippet}

{#snippet rowTemplate()}
	<div class="flex w-72 items-center gap-3">
		<Skeleton class="size-10 rounded-full" />
		<div class="flex-1 space-y-2">
			<Skeleton class="h-4 w-32" />
			<Skeleton class="h-3 w-48" />
		</div>
	</div>
{/snippet}

<Story name="Text Block" template={textTemplate} />
<Story name="Card Loading" template={cardTemplate} />
<Story name="Avatar Row" template={rowTemplate} />
