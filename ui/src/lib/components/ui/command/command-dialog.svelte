<script lang="ts">
	import type { Command as CommandPrimitive } from "bits-ui";
	import type { Snippet } from "svelte";
	import Command from "./command.svelte";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { cn } from "$lib/utils.js";

	let {
		open = $bindable(false),
		ref = $bindable(null),
		value = $bindable(""),
		title = "Command Palette",
		description = "Search for a command to run...",
		children,
		class: className,
		...restProps
	}: CommandPrimitive.RootProps & {
			open?: boolean;
			children: Snippet;
			title?: string;
			description?: string;
			class?: string;
		} = $props();
</script>

<Dialog.Root
	bind:open
	{title}
	{description}
	class={cn("overflow-hidden p-0", className)}
>
	<Command {...restProps} bind:value bind:ref {children} />
</Dialog.Root>
