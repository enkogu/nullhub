<script lang="ts" module>
	export type CountBadgeTone = "neutral" | "primary" | "ok" | "watch" | "risk";
</script>

<script lang="ts">
	import { cn } from "$lib/utils.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";

	let {
		count = 0,
		label = "items",
		max,
		tone = "neutral",
		loading = false,
		class: className,
	}: {
		count?: number;
		label?: string;
		max?: number;
		tone?: CountBadgeTone;
		loading?: boolean;
		class?: string;
	} = $props();

	let displayCount = $derived(formatCount(count, max));
	let accessibleLabel = $derived(`${displayCount} ${label}`);

	function formatCount(value: number, limit?: number): string {
		if (limit !== undefined && value > limit) return `${new Intl.NumberFormat().format(limit)}+`;
		return new Intl.NumberFormat().format(value);
	}

	function toneClass(value: CountBadgeTone): string {
		if (value === "primary") return "border-primary/20 bg-primary/10 text-primary";
		if (value === "ok") return "border-ok/20 bg-ok/10 text-ok";
		if (value === "watch") return "border-watch/20 bg-watch/10 text-watch";
		if (value === "risk") return "border-risk/20 bg-risk/10 text-risk";
		return "border-border bg-muted text-muted-foreground";
	}
</script>

<Badge
	data-slot="count-badge"
	variant="outline"
	class={cn("gap-1.5 px-2.5 py-1 tabular-nums", toneClass(tone), className)}
	aria-label={loading ? `Loading ${label}` : accessibleLabel}
>
	{#if loading}
		<Skeleton class="h-3 w-8" />
	{:else}
		<span class="font-mono text-[0.75rem] leading-none">{displayCount}</span>
		<span class="leading-none">{label}</span>
	{/if}
</Badge>
