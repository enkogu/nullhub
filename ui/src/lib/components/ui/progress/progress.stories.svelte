<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Progress } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Progress',
		component: Progress,
		argTypes: {
			value: {
				control: { type: 'range', min: 0, max: 100, step: 1 }
			},
			max: {
				control: 'number'
			}
		}
	});
</script>

{#snippet progressTemplate(args)}
	<div class="w-80 space-y-2">
		<Progress {...args} aria-label="Workspace image build progress" />
		<p class="text-muted-foreground text-sm">{args.value ?? 0}% complete</p>
	</div>
{/snippet}

<Story name="Empty" args={{ value: 0, max: 100 }} template={progressTemplate} />
<Story name="In Progress" args={{ value: 48, max: 100 }} template={progressTemplate} />
<Story name="Complete" args={{ value: 100, max: 100 }} template={progressTemplate} />
