import tailwindcss from '@tailwindcss/vite';
import type { StorybookConfig } from '@storybook/sveltekit';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
	stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx|svelte)'],
	addons: ['@storybook/addon-svelte-csf'],
	framework: {
		name: '@storybook/sveltekit',
		options: {}
	},
	staticDirs: ['../static'],
	viteFinal: async (config) =>
		mergeConfig(config, {
			plugins: [tailwindcss()]
		})
};

export default config;
