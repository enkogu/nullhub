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

test("hides the inbox badge when the pending count is zero", async () => {
	const screen = await render(AppSidebarFixture, {
		activePath: "/inbox",
		badgeCount: 0,
	});

	expect(screen.container.querySelector('[data-testid="inbox-badge"]')).toBeNull();
});

test("marks System active without expanding it", async () => {
	const screen = await render(AppSidebarFixture, {
		activePath: "/settings",
	});

	const system = sidebarItem(screen.container, "system");

	await expect.element(system).toBeVisible();
	expect(system.getAttribute("data-active")).toBe("true");
	expect(system.getAttribute("aria-expanded")).toBe("false");
});

test("renders Legacy collapsed above System and expands to the four VD-82 links", async () => {
	const screen = await render(AppSidebarFixture);

	const navItems = Array.from(screen.container.querySelectorAll<HTMLElement>("[data-app-sidebar-item]")).map((item) =>
		item.getAttribute("data-app-sidebar-item")
	);
	expect(navItems).toEqual(["home", "inbox", "work", "orders", "team", "market", "legacy", "system"]);

	const legacyTrigger = screen.container.querySelector<HTMLElement>("[data-app-sidebar-legacy-trigger]");
	expect(legacyTrigger).not.toBeNull();
	expect(legacyTrigger?.getAttribute("aria-expanded")).toBe("false");

	await screen.getByRole("button", { name: /Legacy/ }).click();
	expect(legacyTrigger?.getAttribute("aria-expanded")).toBe("true");

	const expectedLinks = [
		["Loops", "/loops"],
		["Artifacts", "/artifacts"],
		["Tickets", "/nulltickets"],
		["Automations", "/automations"],
	] as const;

	for (const [name, href] of expectedLinks) {
		const link = screen.getByRole("link", { name });
		await expect.element(link).toBeVisible();
		const element = await link.element();
		expect(element.getAttribute("href")).toBe(href);
		expect(element.getAttribute("data-app-sidebar-legacy-link")).toBe(href);
	}
});

test("does not expose non-navigation command surfaces in the left panel", async () => {
	const screen = await render(AppSidebarFixture);

	expect(screen.container.textContent).not.toContain("Command palette");
});

test("renders the producer Space switcher in the actual sidebar shell", async () => {
	const screen = await render(AppSidebarFixture);

	await screen.getByRole("button", { name: /Operations 2 pending/ }).click();

	await expect.element(screen.getByRole("menuitem", { name: /All spaces/ })).toBeVisible();
	await expect.element(screen.getByRole("menuitem", { name: /Operations active 2 pending 3 live \$12\.35 spend/ })).toBeVisible();
	await expect.element(screen.getByRole("menuitem", { name: /Lab paused 1 pending 1 live \$1\.25 spend/ })).toBeVisible();

	await screen.getByRole("menuitem", { name: /Lab paused 1 pending 1 live \$1\.25 spend/ }).click();
	await expect.element(screen.getByRole("button", { name: /Lab 1 pending/ })).toBeVisible();
});
