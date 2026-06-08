<script lang="ts" module>
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import BotIcon from "@lucide/svelte/icons/bot";
	import BoxesIcon from "@lucide/svelte/icons/boxes";
	import DatabaseIcon from "@lucide/svelte/icons/database";
	import GalleryVerticalEndIcon from "@lucide/svelte/icons/gallery-vertical-end";
	import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
	import ListChecksIcon from "@lucide/svelte/icons/list-checks";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import PackagePlusIcon from "@lucide/svelte/icons/package-plus";
	import RadioIcon from "@lucide/svelte/icons/radio";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";
	import WorkflowIcon from "@lucide/svelte/icons/workflow";
</script>

<script lang="ts">
	import { page } from "$app/stores";
	import { browser } from "$app/environment";
	import { onMount } from "svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { api } from "$lib/api/client";
	import type { ComponentProps } from "svelte";

	type NavItem = {
		title: string;
		url: string;
		icon: any;
		match?: "exact" | "prefix";
	};

	type UserInfo = {
		name: string;
		email: string;
		initial: string;
	};

	type NavGroup = {
		label: string;
		items: NavItem[];
	};

	const navigationGroups: NavGroup[] = [
		{
			label: "Work",
			items: [
				{ title: "Board", url: "/work", icon: LayoutDashboardIcon, match: "exact" },
				{ title: "Tasks", url: "/work/tasks", icon: ListChecksIcon, match: "prefix" },
				{ title: "Processes", url: "/work/processes", icon: WorkflowIcon, match: "prefix" },
				{ title: "Planner", url: "/work/planner", icon: WorkflowIcon, match: "prefix" },
				{ title: "Dependencies", url: "/work/dependencies", icon: BoxesIcon, match: "prefix" },
			],
		},
		{
			label: "Automations",
			items: [
				{ title: "Workflows", url: "/automations/workflows", icon: WorkflowIcon, match: "prefix" },
				{ title: "Runs", url: "/automations/runs", icon: ListChecksIcon, match: "prefix" },
			],
		},
		{
			label: "Agents",
			items: [
				{ title: "Agents", url: "/agents", icon: BotIcon, match: "exact" },
				{ title: "Roles", url: "/agents/roles", icon: ListChecksIcon, match: "prefix" },
				{ title: "Profiles", url: "/agents/profiles", icon: BoxesIcon, match: "prefix" },
			],
		},
		{
			label: "Capabilities",
			items: [
				{ title: "Skills", url: "/capabilities/skills", icon: PackagePlusIcon, match: "prefix" },
				{ title: "MCP", url: "/capabilities/mcp", icon: BoxesIcon, match: "prefix" },
				{ title: "Hooks", url: "/capabilities/hooks", icon: WorkflowIcon, match: "prefix" },
				{ title: "Instructions", url: "/capabilities/instructions", icon: DatabaseIcon, match: "prefix" },
				{ title: "Memory", url: "/capabilities/memory", icon: DatabaseIcon, match: "prefix" },
				{ title: "Schedules", url: "/capabilities/schedules", icon: ActivityIcon, match: "prefix" },
			],
		},
		{
			label: "Dispatch",
			items: [
				{ title: "Monitor", url: "/dispatch", icon: ActivityIcon, match: "exact" },
				{ title: "Queue", url: "/dispatch/queue", icon: DatabaseIcon, match: "prefix" },
				{ title: "Runs", url: "/dispatch/runs", icon: ListChecksIcon, match: "prefix" },
				{ title: "Failures", url: "/dispatch/failures", icon: ActivityIcon, match: "prefix" },
				{ title: "Telemetry", url: "/dispatch/telemetry", icon: ActivityIcon, match: "prefix" },
			],
		},
		{
			label: "Library",
			items: [
				{ title: "Artifacts", url: "/artifacts", icon: DatabaseIcon, match: "prefix" },
			],
		},
		{
			label: "Inventory",
			items: [
				{ title: "Instances", url: "/inventory/instances", icon: GalleryVerticalEndIcon, match: "prefix" },
				{ title: "Components", url: "/inventory/components", icon: BoxesIcon, match: "prefix" },
				{ title: "Providers", url: "/inventory/providers", icon: BotIcon, match: "prefix" },
				{ title: "Channels", url: "/inventory/channels", icon: RadioIcon, match: "prefix" },
			],
		},
		{
			label: "System",
			items: [{ title: "Settings", url: "/settings", icon: Settings2Icon, match: "exact" }],
		},
	];

	let {
		ref = $bindable(null),
		collapsible = "icon",
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();

	let hubOk = $state(true);
	let statusLoading = false;
	let user = $state<UserInfo>({
		name: "NullHub",
		email: "Signed in",
		initial: "N",
	});
	let currentPath = $derived($page.url.pathname);

	function isActive(item: NavItem): boolean {
		if (item.match === "prefix") {
			return currentPath === item.url || currentPath.startsWith(`${item.url}/`);
		}
		return currentPath === item.url;
	}

	function readCurrentUser() {
		if (!browser) return;

		try {
			const stored = JSON.parse(localStorage.getItem("pocketbase_auth") || "{}");
			const record = stored.record || stored.model || {};
			const email = typeof record.email === "string" ? record.email.trim() : "";
			const name = typeof record.name === "string" ? record.name.trim() : "";
			const label = name || email || "Signed in";
			user = {
				name: label,
				email: email || "Local session",
				initial: (name || email || "N").charAt(0).toUpperCase(),
			};
		} catch {
			user = { name: "NullHub", email: "Signed in", initial: "N" };
		}
	}

	async function loadStatus() {
		if (statusLoading) return;
		statusLoading = true;
		try {
			await api.getStatus();
			hubOk = true;
		} catch (error) {
			hubOk = false;
			console.error(error);
		} finally {
			statusLoading = false;
		}
	}

	onMount(() => {
		readCurrentUser();
		const statusTimer = setTimeout(() => void loadStatus(), 500);
		const interval = setInterval(loadStatus, 5000);
		return () => {
			clearTimeout(statusTimer);
			clearInterval(interval);
		};
	});
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header class="px-3 pb-2 pt-3">
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent="NullHub">
					{#snippet child({ props })}
						<a href="/work" {...props}>
							<div
								class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
							>
								<GalleryVerticalEndIcon class="size-4" />
							</div>
							<div class="grid flex-1 text-start text-sm leading-tight">
								<span class="truncate font-medium">NullHub</span>
								<span class="truncate text-xs">Workspace</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content class="gap-3 px-3">
		{#each navigationGroups as group (group.label)}
			<Sidebar.Group class="p-0">
				<Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
				<Sidebar.Menu>
					{#each group.items as item (item.url)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={isActive(item)} tooltipContent={item.title}>
								{#snippet child({ props })}
									<a href={item.url} {...props}>
										<item.icon />
										<span>{item.title}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.Group>
		{/each}
	</Sidebar.Content>

	<Sidebar.Footer class="px-3 pb-3 pt-2">
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent={hubOk ? "Hub online" : "Hub offline"}>
					{#snippet child({ props })}
						<a href="/dashboard" {...props}>
							<ActivityIcon class={hubOk ? "hub-online" : "hub-offline"} />
							<span>{hubOk ? "Hub online" : "Hub offline"}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent={user.email}>
					{#snippet child({ props })}
						<a href="/settings" {...props}>
							<div
								class="bg-sidebar-accent text-sidebar-accent-foreground flex size-8 items-center justify-center rounded-lg border"
								aria-hidden="true"
							>
								{user.initial}
							</div>
							<div class="grid flex-1 text-start text-sm leading-tight">
								<span class="truncate font-medium">{user.name}</span>
								<span class="truncate text-xs">{user.email}</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent="Sign out">
					{#snippet child({ props })}
						<a href="/logout" {...props}>
							<LogOutIcon />
							<span>Sign out</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
</Sidebar.Root>

<style>
	:global(.hub-online) {
		color: var(--success);
	}

	:global(.hub-offline) {
		color: var(--error);
	}
</style>
