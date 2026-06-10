<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as Avatar from './index.js';

	const avatarImage =
		'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"%3E%3Ccircle cx="48" cy="48" r="44" opacity=".12"/%3E%3Ctext x="48" y="56" text-anchor="middle" font-family="Arial" font-size="28" font-weight="700"%3EVS%3C/text%3E%3C/svg%3E';

	const { Story } = defineMeta({
		title: 'UI/Avatar',
		component: Avatar.Avatar,
		argTypes: {
			loadingStatus: {
				control: 'select',
				options: ['loading', 'loaded', 'error']
			}
		}
	});
</script>

{#snippet imageTemplate(args)}
	<Avatar.Root {...args}>
		<Avatar.Image src={avatarImage} alt="Volksdroid Studio avatar" />
		<Avatar.Fallback>VS</Avatar.Fallback>
	</Avatar.Root>
{/snippet}

{#snippet fallbackTemplate(args)}
	<Avatar.Root {...args}>
		<Avatar.Fallback>AF</Avatar.Fallback>
	</Avatar.Root>
{/snippet}

<Story
	name="Image"
	args={{ loadingStatus: 'loaded', class: 'size-10' }}
	template={imageTemplate}
/>
<Story
	name="Fallback"
	args={{ loadingStatus: 'error', class: 'size-10' }}
	template={fallbackTemplate}
/>
<Story
	name="Compact"
	args={{ loadingStatus: 'loading', class: 'size-7 text-xs' }}
	template={fallbackTemplate}
/>
