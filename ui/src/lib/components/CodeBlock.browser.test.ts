import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import CodeBlock from "./CodeBlock.svelte";

test("renders code with line numbers and copies through callback", async () => {
	const onCopy = vi.fn();
	const screen = await render(CodeBlock, {
		title: "worker.ts",
		language: "ts",
		code: "const ready = true;\nreturn ready;",
		lineNumbers: true,
		onCopy,
	});

	await expect.element(screen.getByText("worker.ts")).toBeVisible();
	await expect.element(screen.getByText("const ready = true;")).toBeVisible();
	await expect.element(screen.getByText("1")).toBeVisible();

	await screen.getByRole("button", { name: "Copy" }).click();
	expect(onCopy).toHaveBeenCalledWith("const ready = true;\nreturn ready;");
	await expect.element(screen.getByRole("button", { name: "Copied" })).toBeVisible();
});

test("renders loading, empty, and error states", async () => {
	const loading = await render(CodeBlock, { state: "loading" });
	expect(loading.container.querySelector('[aria-label="Loading code block"]')).not.toBeNull();

	const empty = await render(CodeBlock, { state: "empty" });
	await expect.element(empty.getByText("No code")).toBeVisible();

	const error = await render(CodeBlock, {
		state: "error",
		errorMessage: "Source failed.",
	});
	await expect.element(error.getByText("Source failed.")).toBeVisible();
});
