import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import { installApiFixture, jsonFixture, type InstalledApiFixture } from "$lib/api/__fixtures__/backend";
import AppSidebarFixture from "./AppSidebar.fixture.svelte";

const transparentAvatar =
	"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

let fixture: InstalledApiFixture | null = null;

function sidebarItem(container: ParentNode, key: string): HTMLElement {
	const item = container.querySelector<HTMLElement>(`[data-app-sidebar-item="${key}"]`);
	expect(item).not.toBeNull();
	return item as HTMLElement;
}

function installSessionFixture(body: unknown, status = 200) {
	fixture?.restore();
	fixture = installApiFixture([
		{
			method: "GET",
			path: "/api/me/bootstrap",
			handler: () => jsonFixture(body, { status }),
		},
	]);
}

function storePocketBaseAuth(value: unknown) {
	localStorage.setItem("pocketbase_auth", JSON.stringify(value));
}

beforeEach(() => {
	localStorage.removeItem("pocketbase_auth");
	installSessionFixture({
		user: {
			name: "Test Operator",
			email: "operator@example.com",
		},
	});
});

afterEach(() => {
	fixture?.restore();
	fixture = null;
	localStorage.removeItem("pocketbase_auth");
});

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
		activePath: "/system/settings",
	});

	const system = sidebarItem(screen.container, "system");

	await expect.element(system).toBeVisible();
	expect(system.getAttribute("data-active")).toBe("true");
	expect(system.getAttribute("aria-expanded")).toBe("false");
});

test("renders Legacy collapsed above System and expands to canonical bridge links", async () => {
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
		["Loops", "/orders/loops"],
		["Artifacts", "/work/artifacts"],
		["Tickets", "/orders/loops"],
		["Automations", "/orders/workflows"],
	] as const;

	for (const [name, href] of expectedLinks) {
		const link = screen.getByRole("link", { name });
		await expect.element(link).toBeVisible();
		const element = await link.element();
		expect(element.getAttribute("href")).toBe(href);
		expect(element.getAttribute("data-app-sidebar-legacy-link")).toBe(href);
	}
});

test("renders System and footer links with canonical hrefs", async () => {
	const screen = await render(AppSidebarFixture);

	await screen.getByRole("button", { name: /System/ }).click();

	const expectedLinks = [
		["Providers", "/system/providers"],
		["Channels", "/system/channels"],
		["Usage", "/system/usage"],
		["Settings", "/system/settings"],
		["Observability", "/system/observability"],
	] as const;

	for (const [name, href] of expectedLinks) {
		const link = screen.getByRole("link", { name }).first();
		await expect.element(link).toBeVisible();
		const element = await link.element();
		expect(element.getAttribute("href")).toBe(href);
	}

	expect(screen.container.querySelector('a[href="/providers"]')).toBeNull();
	expect(screen.container.querySelector('a[href="/channels"]')).toBeNull();
	expect(screen.container.querySelector('a[href="/settings"]')).toBeNull();
	expect(screen.container.querySelector('a[href="/nullwatch"]')).toBeNull();
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

test("renders authenticated PocketBase session name, email, and avatar", async () => {
	installSessionFixture({
		user: {
			id: "usr_ada",
			name: "Ada Lovelace",
			email: "ada@example.com",
			avatar_url: transparentAvatar,
		},
	});

	const screen = await render(AppSidebarFixture);

	await expect.element(screen.getByText("Ada Lovelace")).toBeVisible();
	await expect.element(screen.getByText("ada@example.com")).toBeVisible();

	const avatar = screen.container.querySelector<HTMLImageElement>("[data-app-sidebar-avatar]");
	expect(avatar).not.toBeNull();
	expect(avatar?.getAttribute("src")).toBe(transparentAvatar);
	expect(fixture?.requests.map((request) => request.path)).toContain("/api/me/bootstrap");
});

test("renders an authenticated initial when no avatar URL is available", async () => {
	installSessionFixture({
		user: {
			name: "Grace Hopper",
			email: "grace@example.com",
		},
	});

	const screen = await render(AppSidebarFixture);

	await expect.element(screen.getByText("Grace Hopper")).toBeVisible();
	await expect.element(screen.getByText("grace@example.com")).toBeVisible();

	const initial = screen.container.querySelector<HTMLElement>("[data-app-sidebar-initial]");
	expect(initial?.textContent).toBe("G");
	expect(screen.container.querySelector("[data-app-sidebar-avatar]")).toBeNull();
});

test("falls back to neutral workspace identity when no authenticated user is available", async () => {
	installSessionFixture({ message: "Authentication is required" }, 401);

	const screen = await render(AppSidebarFixture);

	await expect.element(screen.getByText("Workspace user")).toBeVisible();
	await expect.element(screen.getByText("Workspace access")).toBeVisible();
	expect(screen.container.textContent).not.toContain("Volksdroid");
	expect(screen.container.textContent).not.toContain("Local session");
});

test("clears stale local identity when session bootstrap rejects it", async () => {
	storePocketBaseAuth({
		token: "expired-token",
		record: {
			name: "Stale Operator",
			email: "stale@example.com",
			avatar_url: transparentAvatar,
		},
	});
	installSessionFixture({ message: "Authentication is required" }, 401);

	const screen = await render(AppSidebarFixture);

	await expect.element(screen.getByText("Workspace user")).toBeVisible();
	await expect.element(screen.getByText("Workspace access")).toBeVisible();
	expect(screen.container.textContent).not.toContain("Stale Operator");
	expect(screen.container.textContent).not.toContain("stale@example.com");
	expect(screen.container.querySelector("[data-app-sidebar-avatar]")).toBeNull();
	expect(fixture?.requests.at(-1)?.headers.get("authorization")).toBe("Bearer expired-token");
});

test("uses stored OAuth avatar with the authenticated server identity and keeps the sign-out route a full reload", async () => {
	storePocketBaseAuth({
		token: "stored-token",
		record: {
			name: "Stored User",
			email: "stored@example.com",
			avatar_url: transparentAvatar,
		},
	});
	installSessionFixture({
		user: {
			name: "Server User",
			email: "server@example.com",
		},
	});

	const screen = await render(AppSidebarFixture);

	await expect.element(screen.getByText("Server User")).toBeVisible();
	await expect.element(screen.getByText("server@example.com")).toBeVisible();

	const avatar = screen.container.querySelector<HTMLImageElement>("[data-app-sidebar-avatar]");
	expect(avatar?.getAttribute("src")).toBe(transparentAvatar);

	const signOut = await screen.getByRole("link", { name: "Sign out" }).element();
	expect(signOut.getAttribute("href")).toBe("/logout");
	expect(signOut.hasAttribute("data-sveltekit-reload")).toBe(true);
	expect(fixture?.requests.at(-1)?.headers.get("authorization")).toBe("Bearer stored-token");
});
