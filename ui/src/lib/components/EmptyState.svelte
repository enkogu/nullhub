<script lang="ts" module>
	export type EmptyStateIcon = "inbox" | "search" | "plus";
	export type EmptyStateTone = "neutral" | "primary" | "ok" | "watch" | "risk";
</script>

<script lang="ts">
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SearchXIcon from "@lucide/svelte/icons/search-x";
	import { cn } from "$lib/utils.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Card } from "$lib/components/ui/card/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";

	let {
		title = "Nothing here yet",
		description = "Records will appear here once they are available.",
		actionLabel,
		actionHref,
		secondaryActionLabel,
		secondaryActionHref,
		icon = "inbox",
		tone = "neutral",
		loading = false,
		onAction,
		onSecondaryAction,
		class: className,
	}: {
		title?: string;
		description?: string;
		actionLabel?: string;
		actionHref?: string;
		secondaryActionLabel?: string;
		secondaryActionHref?: string;
		icon?: EmptyStateIcon;
		tone?: EmptyStateTone;
		loading?: boolean;
		onAction?: () => void;
		onSecondaryAction?: () => void;
		class?: string;
	} = $props();

	function toneClass(value: EmptyStateTone): string {
		if (value === "primary") return "bg-primary/10 text-primary";
		if (value === "ok") return "bg-ok/10 text-ok";
		if (value === "watch") return "bg-watch/10 text-watch";
		if (value === "risk") return "bg-risk/10 text-risk";
		return "bg-muted text-muted-foreground";
	}
</script>

<Card
	data-slot="empty-state"
	class={cn("items-center px-6 py-8 text-center", className)}
	aria-busy={loading}
>
	{#if loading}
		<Skeleton class="size-11 rounded-full" aria-label="Loading empty state" />
		<div class="flex w-full max-w-sm flex-col items-center gap-2">
			<Skeleton class="h-5 w-40" />
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-2/3" />
		</div>
	{:else}
		<div class={cn("flex size-11 items-center justify-center rounded-full", toneClass(tone))} aria-hidden="true">
			{#if icon === "search"}
				<SearchXIcon class="size-5" />
			{:else if icon === "plus"}
				<PlusIcon class="size-5" />
			{:else}
				<InboxIcon class="size-5" />
			{/if}
		</div>
		<div class="flex max-w-md flex-col items-center gap-1.5">
			<h3 class="text-foreground text-base font-semibold">{title}</h3>
			<p class="text-muted-foreground text-sm leading-6">{description}</p>
		</div>
		{#if actionLabel || secondaryActionLabel}
			<div class="flex flex-wrap justify-center gap-2">
				{#if secondaryActionLabel}
					<Button variant="outline" size="sm" href={secondaryActionHref} onclick={onSecondaryAction}>
						{secondaryActionLabel}
					</Button>
				{/if}
				{#if actionLabel}
					<Button size="sm" href={actionHref} onclick={onAction}>
						{actionLabel}
					</Button>
				{/if}
			</div>
		{/if}
	{/if}
</Card>
