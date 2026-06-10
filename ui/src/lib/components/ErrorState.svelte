<script lang="ts">
	import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
	import { cn } from "$lib/utils.js";
	import { Alert, AlertAction, AlertDescription, AlertTitle } from "$lib/components/ui/alert/index.js";
	import { Button } from "$lib/components/ui/button/index.js";

	let {
		title = "Unable to load this view",
		message = "The request failed before the component could render data.",
		details,
		retryLabel,
		retryHref,
		compact = false,
		onRetry,
		class: className,
	}: {
		title?: string;
		message?: string;
		details?: string;
		retryLabel?: string;
		retryHref?: string;
		compact?: boolean;
		onRetry?: () => void;
		class?: string;
	} = $props();
</script>

<Alert
	data-slot="error-state"
	variant="destructive"
	class={cn("gap-2", compact ? "p-3" : "p-4", retryLabel && "pr-24", className)}
>
	<CircleAlertIcon class="size-4" aria-hidden="true" />
	<AlertTitle>{title}</AlertTitle>
	<AlertDescription class="space-y-2">
		<p>{message}</p>
		{#if details}
			<code class="block rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{details}</code>
		{/if}
	</AlertDescription>
	{#if retryLabel}
		<AlertAction>
			<Button variant="outline" size="sm" href={retryHref} onclick={onRetry}>{retryLabel}</Button>
		</AlertAction>
	{/if}
</Alert>
