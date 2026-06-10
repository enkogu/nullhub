import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import MarkdownViewer from "./MarkdownViewer.svelte";

test("renders markdown and strips YAML frontmatter", async () => {
	const screen = await render(MarkdownViewer, {
		markdown: "---\ntitle: Hidden\n---\n# Order Notes\n\n- Attach evidence",
	});

	await expect.element(screen.getByRole("heading", { name: "Order Notes" })).toBeVisible();
	await expect.element(screen.getByText("Attach evidence")).toBeVisible();
	expect(screen.container.textContent).not.toContain("title: Hidden");
});

test("sanitizes raw HTML, scripts, handlers, and unsafe URLs", async () => {
	const screen = await render(MarkdownViewer, {
		markdown:
			"# Safe\n<script>window.evil = true</script>\n<img src=x onerror=alert(1)>\n[bad](javascript:alert(1))\n<a href=\"javascript:alert(1)\" onclick=\"alert(2)\">raw</a>",
	});

	await expect.element(screen.getByRole("heading", { name: "Safe" })).toBeVisible();
	expect(screen.container.querySelector("script")).toBeNull();
	expect(screen.container.querySelector("img")).toBeNull();
	expect(screen.container.innerHTML).not.toContain("onerror");
	expect(screen.container.innerHTML).not.toContain("onclick");
	const links = Array.from(screen.container.querySelectorAll<HTMLAnchorElement>("a"));
	expect(links.every((link) => link.getAttribute("href") !== "javascript:alert(1)")).toBe(true);
	expect(links.some((link) => link.textContent === "bad" && link.getAttribute("href") === "#")).toBe(true);
});

test("renders loading, empty, and error states", async () => {
	const loading = await render(MarkdownViewer, { state: "loading" });
	expect(loading.container.querySelector('[aria-label="Loading markdown"]')).not.toBeNull();

	const empty = await render(MarkdownViewer, { state: "empty" });
	await expect.element(empty.getByText("No Markdown content")).toBeVisible();

	const error = await render(MarkdownViewer, {
		state: "error",
		errorMessage: "Markdown failed.",
	});
	await expect.element(error.getByText("Markdown failed.")).toBeVisible();
});
