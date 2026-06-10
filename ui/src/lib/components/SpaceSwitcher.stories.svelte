<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import type { Space, SpacesApi } from "$lib/api/spaces";
	import { SpacesStore } from "$lib/stores/spaces.svelte";
	import SpaceSwitcher from "./SpaceSwitcher.svelte";

	const { Story } = defineMeta({
		title: "Components/SpaceSwitcher",
		component: SpaceSwitcher,
	});

	const spaces: Space[] = [
		{ id: "ops", name: "Operations", kind: "workspace", stage: "active" },
		{ id: "field", name: "Field Response", kind: "team", stage: "paused" },
		{ id: "lab", name: "Lab", kind: "workspace", stage: "active" },
	];

	function createApi(spaceList: Space[]): SpacesApi {
		return {
			listSpaces: async () => spaceList,
			createSpace: async (input) => ({
				id: input.id ?? "created",
				name: input.name,
				kind: input.kind ?? "workspace",
				stage: input.stage ?? "active",
			}),
			updateSpace: async (spaceId, input) => ({
				id: spaceId,
				name: input.name ?? "Updated",
				kind: input.kind ?? "workspace",
				stage: input.stage ?? "active",
			}),
			scopedPath: (path) => path,
		};
	}

	function createStore({
		status,
		selectedSpaceId = null,
		error = null,
		spaceList = spaces,
	}: {
		status: "idle" | "loading" | "ready" | "error";
		selectedSpaceId?: string | null;
		error?: string | null;
		spaceList?: Space[];
	}) {
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
</script>

{#snippet switcherTemplate(args)}
	<div class="w-80 p-3">
		<SpaceSwitcher {...args} />
	</div>
{/snippet}

<Story
	name="Loading"
	args={{
		initialOpen: true,
		inlineMenu: true,
		autoLoad: false,
		store: createStore({ status: "loading", spaceList: [] }),
	}}
	template={switcherTemplate}
/>
<Story
	name="Empty"
	args={{
		initialOpen: true,
		inlineMenu: true,
		autoLoad: false,
		store: createStore({ status: "ready", spaceList: [] }),
	}}
	template={switcherTemplate}
/>
<Story
	name="Error"
	args={{
		initialOpen: true,
		inlineMenu: true,
		autoLoad: false,
		store: createStore({ status: "error", error: "Spaces API returned 503.", spaceList: [] }),
	}}
	template={switcherTemplate}
/>
<Story
	name="Populated"
	args={{
		initialOpen: true,
		inlineMenu: true,
		autoLoad: false,
		store: createStore({ status: "ready", selectedSpaceId: "ops" }),
	}}
	template={switcherTemplate}
/>
