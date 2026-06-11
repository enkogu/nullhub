<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import MarkdownViewer from "./MarkdownViewer.svelte";

	const { Story } = defineMeta({
		title: "Components/MarkdownViewer",
		component: MarkdownViewer,
	});

	const markdown = `---
title: Package Notes
---

# Package Notes

Use this kit when an order needs:

- a repeatable loop
- attached evidence
- operator review

> Review provider secrets before install.

\`\`\`ts
const ready = true;
\`\`\`
`;
</script>

{#snippet markdownTemplate(args)}
	<MarkdownViewer {...args} />
{/snippet}

<Story name="Populated" args={{ markdown }} template={markdownTemplate} />
<Story name="Loading" args={{ state: "loading" }} template={markdownTemplate} />
<Story name="Empty" args={{ state: "empty" }} template={markdownTemplate} />
<Story name="Error" args={{ state: "error", errorMessage: "Document failed to render." }} template={markdownTemplate} />
