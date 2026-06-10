import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "vitest-browser-svelte";
import { selectedSpaceQuery, type Space, type SpacesApi } from "$lib/api/spaces";
import { SpacesStore } from "$lib/stores/spaces.svelte";
import SpaceSwitcher from "./SpaceSwitcher.svelte";

const spaces: Space[] = [
	{ id: "ops", name: "Operations", kind: "workspace", stage: "active" },
	{ id: "field", name: "Field Response", kind: "team", stage: "paused" },
	{ id: "lab", name: "Lab", kind: "workspace", stage: "active" },
];

afterEach(() => {
	cleanup();
});

function createApi(spaceList: Space[]): SpacesApi {
	return {
		listSpaces: vi.fn(async () => spaceList),
		createSpace: vi.fn(async (input) => ({
			id: input.id ?? "created",
			name: input.name,
			kind: input.kind ?? "workspace",
			stage: input.stage ?? "active",
		})),
		updateSpace: vi.fn(async (spaceId, input) => ({
			id: spaceId,
			name: input.name ?? "Updated",
			kind: input.kind ?? "workspace",
			stage: input.stage ?? "active",
		})),
		scopedPath: vi.fn((path, options) => (options?.spaceId ? `${path}?space=${options.spaceId}` : path)),
	};
}

function createStore({
	status = "ready",
	selectedSpaceId = null,
	error = null,
	spaceList = spaces,
}: {
	status?: "idle" | "loading" | "ready" | "error";
	selectedSpaceId?: string | null;
	error?: string | null;
	spaceList?: Space[];
} = {}) {
	const store = new SpacesStore({
		api: createApi(spaceList),
		storage: null,
		location: null,
		history: null,
	});
	store.status = status;
	store.spaces = spaceList;
	store.selectedSpaceId = selectedSpaceId;
	store.error = error;
	return store;
}

test("renders loading state", async () => {
	const loading = await render(SpaceSwitcher, {
		initialOpen: true,
		inlineMenu: true,
		autoLoad: false,
		store: createStore({ status: "loading", spaceList: [] }),
	});
	await expect.element(loading.getByRole("button", { name: "Switch space" })).toBeVisible();
	await expect.element(loading.getByText("Loading spaces")).toBeVisible();
});

test("renders empty state", async () => {
	const empty = await render(SpaceSwitcher, {
		initialOpen: true,
		inlineMenu: true,
		autoLoad: false,
		store: createStore({ status: "ready", spaceList: [] }),
	});
	await expect.element(empty.getByRole("menuitem", { name: /All spaces/ })).toBeVisible();
	await expect.element(empty.getByText("New space")).toBeVisible();
});

test("renders error state", async () => {
	const error = await render(SpaceSwitcher, {
		initialOpen: true,
		inlineMenu: true,
		autoLoad: false,
		store: createStore({ status: "error", error: "Spaces API returned 503.", spaceList: [] }),
	});
	await expect.element(error.getByText("Spaces unavailable")).toBeVisible();
	await expect.element(error.getByRole("menuitem", { name: /Retry spaces/ })).toBeVisible();
});

test("renders populated state", async () => {
	const populated = await render(SpaceSwitcher, {
		initialOpen: true,
		inlineMenu: true,
		autoLoad: false,
		store: createStore({ selectedSpaceId: "ops" }),
	});
	await expect.element(populated.getByRole("menuitem", { name: /Operations/ })).toBeVisible();
	await expect.element(populated.getByRole("menuitem", { name: /All spaces/ })).toBeVisible();
	await expect.element(populated.getByRole("menuitem", { name: /Field Response/ })).toBeVisible();
});

test("selects spaces and updates the selected-space query", async () => {
	const store = createStore();
	const screen = await render(SpaceSwitcher, {
		initialOpen: true,
		inlineMenu: true,
		autoLoad: false,
		store,
	});

	await screen.getByRole("menuitem", { name: /Lab/ }).click();
	expect(store.selectedSpaceId).toBe("lab");
	expect(selectedSpaceQuery(store.selectedSpaceId)).toEqual({ space: "lab" });
});

test("supports All spaces and New space actions", async () => {
	const onCreateSpace = vi.fn();
	const store = createStore({ selectedSpaceId: "ops" });
	const screen = await render(SpaceSwitcher, {
		initialOpen: true,
		inlineMenu: true,
		autoLoad: false,
		store,
		onCreateSpace,
	});

	await screen.getByRole("menuitem", { name: /All spaces/ }).click();
	expect(store.selectedSpaceId).toBeNull();
	expect(selectedSpaceQuery(store.selectedSpaceId)).toEqual({ space: undefined });

	await screen.getByRole("button", { name: "Switch space" }).click();
	await screen.getByRole("menuitem", { name: /New space/ }).click();
	expect(onCreateSpace).toHaveBeenCalledTimes(1);
});
