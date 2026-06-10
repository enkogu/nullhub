import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import AppSidebarFixture from "./AppSidebar.fixture.svelte";

function sidebarItem(container: ParentNode, key: string): HTMLElement {
	const item = container.querySelector<HTMLElement>(`[data-app-sidebar-item="${key}"]`);
	expect(item).not.toBeNull();
	return item as HTMLElement;
}

test("marks the active primary route", async () => {
	const screen = await render(AppSidebarFixture, {
		activePath: "/work/tasks",
	});

	const work = sidebarItem(screen.container, "work");
	const orders = sidebarItem(screen.container, "orders");

	await expect.element(work).toBeVisible();
	expect(work.getAttribute("data-active")).toBe("true");
	expect(work.getAttribute("aria-current")).toBe("page");
	expect(orders.getAttribute("data-active")).toBe("false");
});

test("renders the inbox badge slot and keeps System collapsed", async () => {
	const screen = await render(AppSidebarFixture, {
		activePath: "/inbox",
	});

	await expect.element(screen.getByTestId("inbox-badge")).toBeVisible();
	expect(sidebarItem(screen.container, "inbox").getAttribute("data-active")).toBe("true");

	const systemTrigger = screen.container.querySelector<HTMLElement>("[data-app-sidebar-system-trigger]");
	expect(systemTrigger).not.toBeNull();
	expect(systemTrigger?.getAttribute("aria-expanded")).toBe("false");
});
