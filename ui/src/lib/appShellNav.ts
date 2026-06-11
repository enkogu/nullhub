export type AppShellCommandSection = {
	key: string;
	title: string;
	url: string;
	detail: string;
	shortcut: string;
	keywords: string[];
};

export const appShellCommandSections: AppShellCommandSection[] = [
	{
		key: "home",
		title: "Home",
		url: "/",
		detail: "Current state, risks, and recent evidence.",
		shortcut: "H",
		keywords: ["dashboard", "state", "evidence"],
	},
	{
		key: "inbox",
		title: "Inbox",
		url: "/inbox",
		detail: "Requests, approvals, messages, and unresolved inputs.",
		shortcut: "I",
		keywords: ["requests", "approvals", "messages"],
	},
	{
		key: "work",
		title: "Work",
		url: "/work",
		detail: "Live runs, tasks, artifacts, results, and evidence.",
		shortcut: "W",
		keywords: ["runs", "tasks", "artifacts", "results"],
	},
	{
		key: "work-activity",
		title: "Work Activity",
		url: "/work/activity",
		detail: "Space chronicle of events, evidence, and agent updates.",
		shortcut: "A",
		keywords: ["activity", "events", "evidence", "chronicle"],
	},
	{
		key: "orders",
		title: "Orders",
		url: "/orders",
		detail: "Schedules, policies, Loops, and Workflows.",
		shortcut: "O",
		keywords: ["loops", "workflows", "policies", "tickets"],
	},
	{
		key: "team",
		title: "Team",
		url: "/team",
		detail: "Agents, instances, capabilities, skills, MCP, and roles.",
		shortcut: "T",
		keywords: ["agents", "instances", "skills", "mcp", "roles"],
	},
	{
		key: "market",
		title: "Market",
		url: "/market",
		detail: "Built-in catalog, kits, blueprints, and install flow.",
		shortcut: "M",
		keywords: ["catalog", "kits", "blueprints", "install"],
	},
	{
		key: "system",
		title: "System",
		url: "/system",
		detail: "Providers, channels, usage, settings, and observability.",
		shortcut: "S",
		keywords: ["providers", "channels", "settings", "observability"],
	},
];
