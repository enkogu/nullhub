<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { Button } from '../button/index.js';
	import { Badge } from '../badge/index.js';
	import { Card } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Card',
		component: Card
	});
</script>

{#snippet summaryTemplate()}
	<Card class="w-80 px-5">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h3 class="text-base font-semibold">Work queue</h3>
				<p class="text-sm text-muted-foreground">3 runs waiting for review</p>
			</div>
			<Badge variant="warning">Review</Badge>
		</div>
	</Card>
{/snippet}

{#snippet actionTemplate()}
	<Card class="w-80 px-5">
		<div class="space-y-2">
			<h3 class="text-base font-semibold">Install kit</h3>
			<p class="text-sm text-muted-foreground">Adds orders, skills, and default evidence policy.</p>
		</div>
		<div class="flex justify-end gap-2">
			<Button variant="outline" size="sm">Cancel</Button>
			<Button size="sm">Install</Button>
		</div>
	</Card>
{/snippet}

<Story name="Summary" template={summaryTemplate} />
<Story name="With Actions" template={actionTemplate} />
