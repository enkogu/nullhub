import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import DiffViewer, { type DiffFile } from "./DiffViewer.svelte";

const files: DiffFile[] = [
	{
		path: "orders/install.md",
		status: "modified",
		lines: [
			{ type: "hunk", content: "@@ -1,2 +1,2 @@" },
			{ type: "remove", oldLine: 1, content: "old provider" },
			{ type: "add", newLine: 1, content: "selected provider" },
			{ type: "context", oldLine: 2, newLine: 2, content: "attach evidence" },
		],
	},
];

test("renders diff files and line markers", async () => {
	const screen = await render(DiffViewer, { files });

	await expect.element(screen.getByText("orders/install.md")).toBeVisible();
	await expect.element(screen.getByText("old provider")).toBeVisible();
	await expect.element(screen.getByText("selected provider")).toBeVisible();
	expect(screen.container.textContent).toContain("+1");
	expect(screen.container.textContent).toContain("-1");
});

test("renders loading, empty, and error states", async () => {
	const loading = await render(DiffViewer, { state: "loading" });
	expect(loading.container.querySelector('[aria-label="Loading diff"]')).not.toBeNull();

	const empty = await render(DiffViewer, { state: "empty" });
	await expect.element(empty.getByText("No changes")).toBeVisible();

	const error = await render(DiffViewer, {
		state: "error",
		errorMessage: "Diff failed.",
	});
	await expect.element(error.getByText("Diff failed.")).toBeVisible();
});
