<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import CodeBlock from "./CodeBlock.svelte";

	const { Story } = defineMeta({
		title: "Components/CodeBlock",
		component: CodeBlock,
	});
</script>

{#snippet codeTemplate(args)}
	<CodeBlock {...args} />
{/snippet}

<Story
	name="Populated"
	args={{
		title: "install.ts",
		language: "ts",
		code: "export async function install() {\n\treturn { ok: true };\n}",
		lineNumbers: true,
		highlightLines: [2],
	}}
	template={codeTemplate}
/>
<Story name="Loading" args={{ state: "loading" }} template={codeTemplate} />
<Story name="Empty" args={{ state: "empty" }} template={codeTemplate} />
<Story name="Error" args={{ state: "error", errorMessage: "Source file is unavailable." }} template={codeTemplate} />
