<script lang="ts">
	import type { Snippet } from "svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Dialog } from "$lib/components/ui/dialog/index.js";

	let {
		open = $bindable(false),
		title = "Confirm action",
		description = "Review this action before continuing.",
		confirmLabel = "Confirm",
		cancelLabel = "Cancel",
		destructive = false,
		loading = false,
		disabled = false,
		closeOnConfirm = true,
		children,
		onConfirm,
		onCancel,
		class: className,
	}: {
		open?: boolean;
		title?: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		destructive?: boolean;
		loading?: boolean;
		disabled?: boolean;
		closeOnConfirm?: boolean;
		children?: Snippet;
		onConfirm?: () => void;
		onCancel?: () => void;
		class?: string;
	} = $props();

	function cancel() {
		onCancel?.();
		open = false;
	}

	function confirm() {
		onConfirm?.();
		if (closeOnConfirm && !loading) {
			open = false;
		}
	}
</script>

{#snippet footer()}
	<Button variant="outline" size="sm" onclick={cancel} disabled={loading}>{cancelLabel}</Button>
	<Button
		variant={destructive ? "destructive" : "default"}
		size="sm"
		onclick={confirm}
		disabled={disabled || loading}
	>
		{loading ? "Working..." : confirmLabel}
	</Button>
{/snippet}

<Dialog bind:open {title} {description} footer={footer} size="md" class={className}>
	{#if children}
		{@render children()}
	{:else}
		<p class="text-muted-foreground text-sm leading-6">
			This cannot be undone from the current screen.
		</p>
	{/if}
</Dialog>
