<script lang="ts">
	import { cn } from "$lib/utils.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import StatusDot, { type StatusDotStatus } from "./StatusDot.svelte";

	let {
		label,
		kind,
		href,
		status = "unknown",
		description,
		selected = false,
		disabled = false,
		onSelect,
		class: className,
	}: {
		label: string;
		kind?: string;
		href?: string;
		status?: StatusDotStatus;
		description?: string;
		selected?: boolean;
		disabled?: boolean;
		onSelect?: () => void;
		class?: string;
	} = $props();

	let ariaLabel = $derived(description ? `${label}, ${description}` : label);
</script>

<Button
	data-slot="entity-chip"
	variant={selected ? "secondary" : "outline"}
	size="sm"
	href={href}
	disabled={disabled}
	aria-label={ariaLabel}
	aria-current={selected ? "page" : undefined}
	onclick={onSelect}
	class={cn(
		"h-auto min-h-8 justify-start rounded-full px-2.5 py-1 text-left",
		"max-w-full gap-2 whitespace-normal",
		selected && "border-primary/30 bg-primary/10 text-primary",
		className,
	)}
>
	<StatusDot status={status} showLabel={false} size="sm" />
	<span class="min-w-0 truncate">{label}</span>
	{#if kind}
		<Badge variant="secondary" class="shrink-0 rounded-full px-1.5 py-0 text-[0.6875rem]">{kind}</Badge>
	{/if}
</Button>
