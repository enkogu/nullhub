<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import DiffViewer, { type DiffFile } from "./DiffViewer.svelte";

	const { Story } = defineMeta({
		title: "Components/DiffViewer",
		component: DiffViewer,
	});

	const files: DiffFile[] = [
		{
			path: "orders/install.md",
			status: "modified",
			additions: 2,
			deletions: 1,
			lines: [
				{ type: "hunk", content: "@@ -1,3 +1,4 @@" },
				{ type: "context", oldLine: 1, newLine: 1, content: "# Install order" },
				{ type: "remove", oldLine: 2, content: "Use default provider." },
				{ type: "add", newLine: 2, content: "Use the selected provider." },
				{ type: "add", newLine: 3, content: "Attach evidence after install." },
			],
		},
	];
</script>

{#snippet diffTemplate(args)}
	<DiffViewer {...args} />
{/snippet}

<Story name="Populated" args={{ files }} template={diffTemplate} />
<Story name="Loading" args={{ state: "loading" }} template={diffTemplate} />
<Story name="Empty" args={{ state: "empty" }} template={diffTemplate} />
<Story name="Error" args={{ state: "error", errorMessage: "Patch data is unavailable." }} template={diffTemplate} />
