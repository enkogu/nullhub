<script lang="ts" module>
	export type StatusDotStatus =
		| "ok"
		| "watch"
		| "risk"
		| "muted"
		| "running"
		| "starting"
		| "queued"
		| "stopped"
		| "failed"
		| "unknown";

	export type StatusDotSize = "sm" | "md" | "lg";
</script>

<script lang="ts">
	import { cn } from "$lib/utils.js";

	let {
		status = "unknown",
		label,
		showLabel = true,
		size = "md",
		pulse,
		class: className,
	}: {
		status?: StatusDotStatus;
		label?: string;
		showLabel?: boolean;
		size?: StatusDotSize;
		pulse?: boolean;
		class?: string;
	} = $props();

	let displayLabel = $derived(label ?? defaultLabel(status));
	let shouldPulse = $derived(pulse ?? (status === "running" || status === "starting" || status === "queued"));

	function defaultLabel(value: StatusDotStatus): string {
		if (value === "ok") return "OK";
		return value.charAt(0).toUpperCase() + value.slice(1);
	}

	function toneClass(value: StatusDotStatus): string {
		if (value === "ok" || value === "running") return "text-ok";
		if (value === "watch" || value === "starting" || value === "queued") return "text-watch";
		if (value === "risk" || value === "failed") return "text-risk";
		return "text-status-muted";
	}

	function dotSizeClass(value: StatusDotSize): string {
		if (value === "sm") return "size-1.5";
		if (value === "lg") return "size-2.5";
		return "size-2";
	}
</script>

<span
	data-slot="status-dot"
	class={cn("inline-flex min-w-0 items-center gap-1.5 text-sm font-medium", toneClass(status), className)}
	role="status"
	aria-label={showLabel ? undefined : displayLabel}
>
	<span
		class={cn(
			"inline-block shrink-0 rounded-full bg-current",
			dotSizeClass(size),
			shouldPulse && "animate-pulse motion-reduce:animate-none",
		)}
		aria-hidden="true"
	></span>
	{#if showLabel}
		<span class="truncate">{displayLabel}</span>
	{/if}
</span>
