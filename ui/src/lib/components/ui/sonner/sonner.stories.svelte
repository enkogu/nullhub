<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { toast } from 'svelte-sonner';
	import { Toaster } from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Sonner',
		component: Toaster,
		argTypes: {
			richColors: {
				control: 'boolean'
			},
			position: {
				control: 'select',
				options: ['top-right', 'top-center', 'bottom-right', 'bottom-center']
			}
		}
	});
</script>

{#snippet sonnerTemplate(args)}
	<div class="flex flex-wrap gap-2">
		<Toaster {...args} />
		<button class="rounded-md border px-3 py-1.5 text-sm" type="button" onclick={() => toast.success('Loop installed')}>
			Success
		</button>
		<button class="rounded-md border px-3 py-1.5 text-sm" type="button" onclick={() => toast.info('Agent is working')}>
			Info
		</button>
		<button class="rounded-md border px-3 py-1.5 text-sm" type="button" onclick={() => toast.warning('Provider quota is low')}>
			Warning
		</button>
		<button class="rounded-md border px-3 py-1.5 text-sm" type="button" onclick={() => toast.error('Order failed')}>
			Error
		</button>
	</div>
{/snippet}

<Story name="Default" args={{ richColors: false, position: 'bottom-right' }} template={sonnerTemplate} />
<Story name="Rich Colors" args={{ richColors: true, position: 'top-right' }} template={sonnerTemplate} />
