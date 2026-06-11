<script lang="ts" module>
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import BotIcon from "@lucide/svelte/icons/bot";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
	import ListChecksIcon from "@lucide/svelte/icons/list-checks";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import PackagePlusIcon from "@lucide/svelte/icons/package-plus";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";

	export type AppSidebarNavKey =
		| "home"
		| "inbox"
		| "work"
		| "orders"
		| "team"
		| "market"
		| "system";

	export type SpaceOption = {
		id: string;
		name: string;
		detail: string;
		initial?: string;
	};

	type NavItem = {
		key: AppSidebarNavKey;
		title: string;
		url: string;
		icon: any;
		exact?: string[];
		prefixes?: string[];
		excludePrefixes?: string[];
		shortcut?: string;
	};

	export const appSidebarPrimaryItems: NavItem[] = [
		{
			key: "home",
			title: "Home",
			url: "/",
			icon: LayoutDashboardIcon,
			exact: ["/"],
			shortcut: "g h",
		},
		{
			key: "inbox",
			title: "Inbox",
			url: "/inbox",
			icon: InboxIcon,
			prefixes: ["/inbox"],
			shortcut: "g i",
		},
		{
			key: "work",
			title: "Work",
			url: "/work",
			icon: ActivityIcon,
			prefixes: ["/work", "/mission-control", "/dispatch", "/report", "/task-flows", "/nullboiler/runs"],
		},
		{
			key: "orders",
			title: "Orders",
			url: "/orders",
			icon: ListChecksIcon,
			prefixes: ["/orders", "/loops", "/automations", "/nullboiler/workflows", "/nulltickets"],
			excludePrefixes: ["/loops/marketplace", "/nulltickets/store"],
		},
		{
			key: "team",
			title: "Team",
			url: "/team",
			icon: BotIcon,
			prefixes: ["/team", "/agents", "/instances", "/capabilities", "/inventory/instances"],
		},
		{
			key: "market",
			title: "Market",
			url: "/market",
			icon: PackagePlusIcon,
			prefixes: ["/market", "/install", "/loops/marketplace", "/nulltickets/store", "/inventory/components"],
		},
	];

	const systemItem: NavItem = {
		key: "system",
		title: "System",
		url: "/system",
		icon: Settings2Icon,
		prefixes: [
			"/system",
			"/providers",
			"/channels",
			"/configs",
			"/settings",
			"/observability",
			"/nullwatch",
			"/inventory/providers",
			"/inventory/channels",
		],
	};

	const systemLinks = [
		{ title: "Providers", url: "/providers" },
		{ title: "Channels", url: "/channels" },
		{ title: "Settings", url: "/settings" },
		{ title: "Observability", url: "/nullwatch" },
	];

	const fallbackSpaces: SpaceOption[] = [
		{
			id: "local",
			name: "Local space",
			detail: "Studio workspace",
			initial: "L",
		},
	];
</script>

<script lang="ts">
	import { browser } from "$app/environment";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import { onMount } from "svelte";
	import * as Collapsible from "$lib/components/ui/collapsible/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { useSidebar } from "$lib/components/ui/sidebar/index.js";
	import { api } from "$lib/api/client";
	import { pollWhileVisible } from "$lib/poll";
	import { readLocalSessionUser } from "$lib/sessionState";
	import type { ComponentProps, Snippet } from "svelte";

	type UserInfo = {
		name: string;
		email: string;
		initial: string;
	};

	let {
		ref = $bindable(null),
		collapsible = "icon",
		activePath,
		hubStatus,
		inboxBadge,
		pollHubStatus = true,
		spaces = fallbackSpaces,
		activeSpaceId,
		onSpaceChange = () => {},
		onCreateSpace = () => {},
		...restProps
	}: ComponentProps<typeof Sidebar.Root> & {
		activePath?: string;
		hubStatus?: "online" | "offline";
		inboxBadge?: Snippet;
		pollHubStatus?: boolean;
		spaces?: SpaceOption[];
		activeSpaceId?: string;
		onSpaceChange?: (spaceId: string) => void;
		onCreateSpace?: () => void;
	} = $props();

	let hubOk = $state(true);
	let statusLoading = false;
	let systemOpen = $state(false);
	let selectedSpaceId = $state("");
	let shortcutPrefix = $state(false);
	let shortcutTimer: ReturnType<typeof setTimeout> | undefined;
	let user = $state<UserInfo>({
		name: "Volksdroid",
		email: "Local session",
		initial: "V",
	});

	let currentPath = $derived(activePath ?? $page.url.pathname);
	let activeSpace = $derived(spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0]);
	const sidebar = useSidebar();

	$effect(() => {
		if (hubStatus) hubOk = hubStatus === "online";
	});

	$effect(() => {
		if (activeSpaceId !== undefined) {
			selectedSpaceId = activeSpaceId;
		} else if (!spaces.some((space) => space.id === selectedSpaceId)) {
			selectedSpaceId = spaces[0]?.id ?? "";
		}
	});

	function startsWithSegment(path: string, prefix: string): boolean {
		return path === prefix || path.startsWith(`${prefix}/`);
	}

	function isActive(item: NavItem): boolean {
		if (item.excludePrefixes?.some((prefix) => startsWithSegment(currentPath, prefix))) return false;
		if (item.exact?.includes(currentPath)) return true;
		return item.prefixes?.some((prefix) => startsWithSegment(currentPath, prefix)) ?? false;
	}

	function readCurrentUser() {
		if (!browser) return;

		try {
			user = readLocalSessionUser();
		} catch {
			user = { name: "Local session", email: "Workspace access", initial: "V" };
		}
	}

	async function loadStatus() {
		if (statusLoading || !pollHubStatus) return;
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

	function selectSpace(spaceId: string) {
		selectedSpaceId = spaceId;
		onSpaceChange(spaceId);
	}

	function resetShortcutPrefix() {
		shortcutPrefix = false;
		if (shortcutTimer) {
			clearTimeout(shortcutTimer);
			shortcutTimer = undefined;
		}
	}

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		const tagName = target.tagName.toLowerCase();
		return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
	}

	function navigateFromShortcut(url: string) {
		if (activePath !== undefined) return;
		void goto(url);
	}

	function handleShortcutKeydown(event: KeyboardEvent) {
		if (!browser || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
		if (isEditableTarget(event.target)) return;

		const key = event.key.toLowerCase();

		if (!shortcutPrefix) {
			if (key !== "g") return;
			event.preventDefault();
			shortcutPrefix = true;
			if (shortcutTimer) clearTimeout(shortcutTimer);
			shortcutTimer = setTimeout(() => resetShortcutPrefix(), 1200);
			return;
		}

		event.preventDefault();
		resetShortcutPrefix();
		if (key === "h") navigateFromShortcut("/");
		if (key === "i") navigateFromShortcut("/inbox");
	}

	onMount(() => {
		readCurrentUser();
		if (!pollHubStatus) return () => resetShortcutPrefix();

		const statusTimer = setTimeout(() => void loadStatus(), 500);
		const stopPolling = pollWhileVisible(loadStatus, 5000);
		return () => {
			clearTimeout(statusTimer);
			stopPolling();
			resetShortcutPrefix();
		};
	});
</script>

<svelte:window onkeydown={handleShortcutKeydown} />

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header class="px-3 pb-2 pt-3">
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuButton
								{...props}
								size="lg"
								tooltipContent={activeSpace?.name ?? "Space"}
								class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							>
								<div
									class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
									aria-hidden="true"
								>
									{activeSpace?.initial ?? activeSpace?.name?.slice(0, 1) ?? "S"}
								</div>
								<div class="grid flex-1 text-start text-sm leading-tight">
									<span class="truncate font-medium">{activeSpace?.name ?? "Space"}</span>
									<span class="truncate text-xs">{activeSpace?.detail ?? "Workspace"}</span>
								</div>
								<ChevronsUpDownIcon class="ms-auto size-4" />
							</Sidebar.MenuButton>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
						align="start"
						side={sidebar.isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						<DropdownMenu.Label class="text-muted-foreground text-xs">Spaces</DropdownMenu.Label>
						{#each spaces as space (space.id)}
							<DropdownMenu.Item onSelect={() => selectSpace(space.id)} class="gap-2 p-2">
								<div class="flex size-6 items-center justify-center rounded-md border">
									<span class="text-xs font-medium">{space.initial ?? space.name.slice(0, 1)}</span>
								</div>
								<div class="grid flex-1 text-start text-sm leading-tight">
									<span class="truncate font-medium">{space.name}</span>
									<span class="truncate text-xs text-muted-foreground">{space.detail}</span>
								</div>
							</DropdownMenu.Item>
						{/each}
						<DropdownMenu.Separator />
						<DropdownMenu.Item onSelect={onCreateSpace} class="gap-2 p-2">
							<div class="flex size-6 items-center justify-center rounded-md border bg-transparent">
								<PlusIcon class="size-4" />
							</div>
							<span class="text-muted-foreground font-medium">New space</span>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content class="gap-3 px-3">
		<Sidebar.Group class="p-0">
			<Sidebar.GroupLabel>Studio</Sidebar.GroupLabel>
			<Sidebar.Menu aria-label="Primary navigation">
				{#each appSidebarPrimaryItems as item (item.key)}
					<Sidebar.MenuItem class="relative">
						<Sidebar.MenuButton isActive={isActive(item)} tooltipContent={item.title}>
							{#snippet child({ props })}
								<a
									href={item.url}
									{...props}
									aria-current={isActive(item) ? "page" : undefined}
									aria-keyshortcuts={item.shortcut}
									data-app-sidebar-item={item.key}
								>
									<item.icon />
									<span>{item.title}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
						{#if item.key === "inbox" && inboxBadge}
							<Sidebar.MenuBadge aria-label="Inbox count">
								{@render inboxBadge()}
							</Sidebar.MenuBadge>
						{/if}
					</Sidebar.MenuItem>
				{/each}

				<Collapsible.Root bind:open={systemOpen} class="group/collapsible">
					{#snippet child({ props })}
						<Sidebar.MenuItem {...props}>
							<Collapsible.Trigger>
								{#snippet child({ props })}
									<Sidebar.MenuButton
										{...props}
										isActive={isActive(systemItem)}
										tooltipContent="System"
										data-app-sidebar-item="system"
										data-app-sidebar-system-trigger
									>
										<Settings2Icon />
										<span>System</span>
										<ChevronRightIcon
											class="ms-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
										/>
									</Sidebar.MenuButton>
								{/snippet}
							</Collapsible.Trigger>
							<Collapsible.Content>
								<Sidebar.MenuSub>
									{#each systemLinks as subItem (subItem.url)}
										<Sidebar.MenuSubItem>
											<Sidebar.MenuSubButton>
												{#snippet child({ props })}
													<a href={subItem.url} {...props}>
														<span>{subItem.title}</span>
													</a>
												{/snippet}
											</Sidebar.MenuSubButton>
										</Sidebar.MenuSubItem>
									{/each}
								</Sidebar.MenuSub>
							</Collapsible.Content>
						</Sidebar.MenuItem>
					{/snippet}
				</Collapsible.Root>
			</Sidebar.Menu>
		</Sidebar.Group>
	</Sidebar.Content>

	<Sidebar.Footer class="px-3 pb-3 pt-2">
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent={hubOk ? "Hub online" : "Hub offline"}>
					{#snippet child({ props })}
						<a href="/system" {...props}>
							<ActivityIcon class={hubOk ? "text-ok" : "text-risk"} />
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
						<a href="/logout" data-sveltekit-reload {...props}>
							<LogOutIcon />
							<span>Sign out</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
</Sidebar.Root>
