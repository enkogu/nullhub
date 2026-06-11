<script lang="ts" module>
	export type CodeBlockState = "loading" | "empty" | "error" | "populated";
</script>

<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import ClipboardIcon from "@lucide/svelte/icons/clipboard";
	import { cn } from "$lib/utils.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import EmptyState from "./EmptyState.svelte";
	import ErrorState from "./ErrorState.svelte";

	let {
		code = "",
		language,
		title,
		state: componentState,
		errorTitle = "Code unavailable",
		errorMessage = "The code block could not be loaded.",
		emptyTitle = "No code",
		emptyDescription = "Source content will appear here when available.",
			copyLabel = "Copy",
			copiedLabel = "Copied",
			ariaLabel,
			showCopy = true,
			lineNumbers = false,
		wrap = false,
		highlightLines = [],
		onCopy,
		class: className,
	}: {
		code?: string;
		language?: string;
		title?: string;
		state?: CodeBlockState;
		errorTitle?: string;
		errorMessage?: string;
		emptyTitle?: string;
		emptyDescription?: string;
			copyLabel?: string;
			copiedLabel?: string;
			ariaLabel?: string;
			showCopy?: boolean;
		lineNumbers?: boolean;
		wrap?: boolean;
		highlightLines?: number[];
		onCopy?: (code: string) => void;
		class?: string;
	} = $props();

	let copied = $state(false);
	let copyResetTimer: ReturnType<typeof setTimeout> | undefined;
	let resolvedState = $derived(componentState ?? (code.trim() ? "populated" : "empty"));
	let lines = $derived(code.length > 0 ? code.replace(/\n$/u, "").split("\n") : []);
	let highlighted = $derived(new Set(highlightLines));

	async function copyCode() {
		onCopy?.(code);
		if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(code);
			} catch {
				// Browser tests and sandboxed embeds may deny clipboard writes.
			}
		}
		copied = true;
		if (copyResetTimer) clearTimeout(copyResetTimer);
		copyResetTimer = setTimeout(() => {
			copied = false;
		}, 1400);
	}
</script>

	<section
		data-slot="code-block"
		class={cn("overflow-hidden rounded-lg border bg-card text-card-foreground", className)}
		aria-busy={resolvedState === "loading"}
		aria-label={ariaLabel}
	>
	{#if resolvedState === "loading"}
		<div class="border-b px-4 py-3">
			<Skeleton class="h-4 w-40" aria-label="Loading code block" />
		</div>
		<div class="space-y-2 p-4">
			<Skeleton class="h-4 w-11/12" />
			<Skeleton class="h-4 w-8/12" />
			<Skeleton class="h-4 w-10/12" />
		</div>
	{:else if resolvedState === "error"}
		<div class="p-4">
			<ErrorState title={errorTitle} message={errorMessage} compact />
		</div>
	{:else if resolvedState === "empty"}
		<div class="p-4">
			<EmptyState title={emptyTitle} description={emptyDescription} icon="inbox" tone="neutral" />
		</div>
	{:else}
		<div class="flex min-h-12 items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2">
			<div class="min-w-0">
				{#if title}
					<h3 class="truncate text-sm font-medium text-foreground">{title}</h3>
				{/if}
				{#if language}
					<p class="font-mono text-xs uppercase tracking-normal text-muted-foreground">{language}</p>
				{/if}
			</div>
			{#if showCopy}
				<Button variant="outline" size="sm" onclick={copyCode} aria-label={copied ? copiedLabel : copyLabel}>
					{#if copied}
						<CheckIcon class="size-4" aria-hidden="true" />
						{copiedLabel}
					{:else}
						<ClipboardIcon class="size-4" aria-hidden="true" />
						{copyLabel}
					{/if}
				</Button>
			{/if}
		</div>
		<pre class={cn("overflow-x-auto p-0 font-mono text-sm leading-6", wrap && "whitespace-pre-wrap break-words")}><code class="block py-3">{#each lines as line, index}<span
					class={cn("block px-4", highlighted.has(index + 1) && "bg-primary/10 text-foreground")}
				>{#if lineNumbers}<span class="mr-4 inline-block w-8 select-none text-right text-muted-foreground">{index + 1}</span>{/if}{line || " "}</span>{/each}</code></pre>
	{/if}
</section>
