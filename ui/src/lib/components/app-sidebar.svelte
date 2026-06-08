<script lang="ts" module>
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import BotIcon from "@lucide/svelte/icons/bot";
	import BoxesIcon from "@lucide/svelte/icons/boxes";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import CircleIcon from "@lucide/svelte/icons/circle";
	import GalleryVerticalEndIcon from "@lucide/svelte/icons/gallery-vertical-end";
	import HouseIcon from "@lucide/svelte/icons/house";
	import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
	import ListChecksIcon from "@lucide/svelte/icons/list-checks";
	import PackagePlusIcon from "@lucide/svelte/icons/package-plus";
	import RadioIcon from "@lucide/svelte/icons/radio";
	import ServerIcon from "@lucide/svelte/icons/server";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";
	import TicketIcon from "@lucide/svelte/icons/ticket";
	import WorkflowIcon from "@lucide/svelte/icons/workflow";
</script>

<script lang="ts">
	import { page } from "$app/stores";
	import { browser } from "$app/environment";
	import { onMount } from "svelte";
	import * as Collapsible from "$lib/components/ui/collapsible/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { api } from "$lib/api/client";
	import { componentInstancesRoute, instanceRoute } from "$lib/nullstack/path";
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

	const primaryItems: NavItem[] = [
		{ title: "System Status", url: "/", icon: HouseIcon, match: "exact" },
		{ title: "Dashboard", url: "/dashboard", icon: LayoutDashboardIcon, match: "exact" },
		{ title: "Mission Control", url: "/mission-control", icon: ActivityIcon, match: "exact" },
		{ title: "Install Component", url: "/install", icon: PackagePlusIcon, match: "prefix" },
		{ title: "Providers", url: "/providers", icon: BotIcon, match: "exact" },
		{ title: "Channels", url: "/channels", icon: RadioIcon, match: "exact" },
	];

	const orchestrationItems: NavItem[] = [
		{ title: "NullBoiler", url: "/nullboiler", icon: WorkflowIcon, match: "exact" },
		{ title: "Workflows", url: "/nullboiler/workflows", icon: WorkflowIcon, match: "prefix" },
		{ title: "Runs", url: "/nullboiler/runs", icon: ListChecksIcon, match: "prefix" },
		{ title: "Ticket Store", url: "/nulltickets/store", icon: TicketIcon, match: "prefix" },
		{ title: "Observability", url: "/nullwatch", icon: ActivityIcon, match: "prefix" },
	];

	const utilityItems: NavItem[] = [
		{ title: "Configs", url: "/configs", icon: BoxesIcon, match: "exact" },
		{ title: "Settings", url: "/settings", icon: Settings2Icon, match: "exact" },
	];

	let {
		ref = $bindable(null),
		collapsible = "icon",
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();

	let instances = $state<Record<string, Record<string, any>>>({});
	let hubOk = $state(true);
	let user = $state<UserInfo>({
		name: "NullHub",
		email: "Signed in",
		initial: "N",
	});
	let currentPath = $derived($page.url.pathname);
	let componentEntries = $derived(Object.entries(instances));
	let instanceCount = $derived(
		componentEntries.reduce((total, [, items]) => total + Object.keys(items || {}).length, 0)
	);

	function isActive(item: NavItem): boolean {
		if (item.match === "prefix") {
			return currentPath === item.url || currentPath.startsWith(`${item.url}/`);
		}
		return currentPath === item.url;
	}

	function componentActive(component: string): boolean {
		const root = componentInstancesRoute(component);
		if (currentPath === root || currentPath.startsWith(`${root}/`)) return true;
		if (component === "nullboiler") return currentPath.startsWith("/nullboiler");
		if (component === "nulltickets") return currentPath.startsWith("/nulltickets");
		if (component === "nullwatch") return currentPath.startsWith("/nullwatch");
		return false;
	}

	function instanceStatusLabel(info: any): string {
		return typeof info?.status === "string" && info.status.trim() ? info.status : "unknown";
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
		try {
			const status = await api.getStatus();
			instances = status.instances || {};
			hubOk = true;
		} catch (error) {
			hubOk = false;
			console.error(error);
		}
	}

	onMount(() => {
		readCurrentUser();
		void loadStatus();
		const interval = setInterval(loadStatus, 5000);
		return () => clearInterval(interval);
	});
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header class="px-3 pb-2 pt-3">
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent="NullHub">
					{#snippet child({ props })}
						<a href="/" {...props}>
							<div
								class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
							>
								<GalleryVerticalEndIcon class="size-4" />
							</div>
							<div class="grid flex-1 text-start text-sm leading-tight">
								<span class="truncate font-medium">NullHub</span>
								<span class="truncate text-xs">
									{instanceCount} {instanceCount === 1 ? "instance" : "instances"}
								</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content class="gap-3 overflow-hidden px-3">
		<Sidebar.Group class="p-0">
			<Sidebar.GroupLabel>Platform</Sidebar.GroupLabel>
			<Sidebar.Menu>
				{#each primaryItems as item (item.url)}
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

		<Sidebar.Group class="p-0">
			<Sidebar.GroupLabel>Instances</Sidebar.GroupLabel>
			<Sidebar.Menu>
				{#if componentEntries.length === 0}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton tooltipContent="No instances" class="text-sidebar-foreground/65">
							{#snippet child({ props })}
								<div {...props}>
									<ServerIcon />
									<span>No instances</span>
								</div>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				{:else}
					{#each componentEntries as [component, items] (component)}
						<Collapsible.Root open={componentActive(component)} class="group/collapsible">
							{#snippet child({ props })}
								<Sidebar.MenuItem {...props}>
									<Collapsible.Trigger>
										{#snippet child({ props })}
											<Sidebar.MenuButton
												{...props}
												isActive={componentActive(component)}
												tooltipContent={component}
											>
												<ServerIcon />
												<span>{component}</span>
												<ChevronRightIcon
													class="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
												/>
											</Sidebar.MenuButton>
										{/snippet}
									</Collapsible.Trigger>
									<Collapsible.Content>
										<Sidebar.MenuSub>
											<Sidebar.MenuSubItem>
												<Sidebar.MenuSubButton
													href={componentInstancesRoute(component)}
													isActive={currentPath === componentInstancesRoute(component)}
												>
													<span>All {component}</span>
												</Sidebar.MenuSubButton>
											</Sidebar.MenuSubItem>
											{#each Object.entries(items || {}) as [name, info] (name)}
												<Sidebar.MenuSubItem>
													<Sidebar.MenuSubButton
														href={instanceRoute(component, name)}
														isActive={currentPath === instanceRoute(component, name)}
														title={instanceStatusLabel(info)}
													>
														<CircleIcon
															class={(info as any)?.status === "running"
																? "status-icon status-running"
																: "status-icon status-muted"}
														/>
														<span>{name}</span>
													</Sidebar.MenuSubButton>
												</Sidebar.MenuSubItem>
											{/each}
										</Sidebar.MenuSub>
									</Collapsible.Content>
								</Sidebar.MenuItem>
							{/snippet}
						</Collapsible.Root>
					{/each}
				{/if}
			</Sidebar.Menu>
		</Sidebar.Group>

		<Sidebar.Group class="p-0">
			<Sidebar.GroupLabel>Orchestration</Sidebar.GroupLabel>
			<Sidebar.Menu>
				{#each orchestrationItems as item (item.url)}
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

		<Sidebar.Group class="p-0">
			<Sidebar.GroupLabel>Administration</Sidebar.GroupLabel>
			<Sidebar.Menu>
				{#each utilityItems as item (item.url)}
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
	</Sidebar.Content>

	<Sidebar.Footer class="px-3 pb-3 pt-2">
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent={hubOk ? "Hub online" : "Hub offline"}>
					{#snippet child({ props })}
						<div {...props}>
							<ActivityIcon class={hubOk ? "hub-online" : "hub-offline"} />
							<span>{hubOk ? "Hub online" : "Hub offline"}</span>
						</div>
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
		</Sidebar.Menu>
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>

<style>
	.status-icon {
		width: 0.625rem;
		height: 0.625rem;
	}

	.status-running {
		color: var(--success);
		fill: var(--success);
	}

	.status-muted {
		color: var(--fg-dim);
		fill: var(--fg-dim);
	}

	.hub-online {
		color: var(--success);
	}

	.hub-offline {
		color: var(--error);
	}
</style>
