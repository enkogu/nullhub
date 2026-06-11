<script lang="ts" module>
	export type DiffViewerState = "loading" | "empty" | "error" | "populated";
	export type DiffLineType = "context" | "add" | "remove" | "hunk";
	export type DiffFileStatus = "added" | "modified" | "removed" | "renamed";

	export type DiffLine = {
		type: DiffLineType;
		content: string;
		oldLine?: number;
		newLine?: number;
	};

	export type DiffFile = {
		path: string;
		oldPath?: string;
		status?: DiffFileStatus;
		additions?: number;
		deletions?: number;
		lines: DiffLine[];
	};
</script>

<script lang="ts">
	import FileDiffIcon from "@lucide/svelte/icons/file-diff";
	import { cn } from "$lib/utils.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import EmptyState from "./EmptyState.svelte";
	import ErrorState from "./ErrorState.svelte";

	let {
		files = [],
		state,
		title = "Diff",
		emptyTitle = "No changes",
		emptyDescription = "File changes will appear here when available.",
		errorTitle = "Diff unavailable",
		errorMessage = "The diff could not be rendered.",
		class: className,
	}: {
		files?: DiffFile[];
		state?: DiffViewerState;
		title?: string;
		emptyTitle?: string;
		emptyDescription?: string;
		errorTitle?: string;
		errorMessage?: string;
		class?: string;
	} = $props();

	let resolvedState = $derived(state ?? (files.length > 0 ? "populated" : "empty"));
	let totalAdditions = $derived(files.reduce((total, file) => total + (file.additions ?? file.lines.filter((line) => line.type === "add").length), 0));
	let totalDeletions = $derived(files.reduce((total, file) => total + (file.deletions ?? file.lines.filter((line) => line.type === "remove").length), 0));

	function lineClasses(type: DiffLineType): string {
		if (type === "add") return "bg-ok/10 text-foreground";
		if (type === "remove") return "bg-destructive/10 text-foreground";
		if (type === "hunk") return "bg-primary/10 text-primary";
		return "text-foreground";
	}

	function marker(type: DiffLineType): string {
		if (type === "add") return "+";
		if (type === "remove") return "-";
		if (type === "hunk") return "@";
		return " ";
	}
</script>

<section data-slot="diff-viewer" class={cn("overflow-hidden rounded-lg border bg-card text-card-foreground", className)} aria-busy={resolvedState === "loading"}>
	{#if resolvedState === "loading"}
		<div class="border-b px-4 py-3">
			<Skeleton class="h-4 w-44" aria-label="Loading diff" />
		</div>
		<div class="space-y-2 p-4">
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-10/12" />
			<Skeleton class="h-4 w-11/12" />
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
		<header class="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
			<div class="flex min-w-0 items-center gap-2">
				<FileDiffIcon class="size-4 text-muted-foreground" aria-hidden="true" />
				<h3 class="truncate text-sm font-semibold text-foreground">{title}</h3>
			</div>
			<div class="flex items-center gap-2 font-mono text-xs">
				<Badge variant="success">+{totalAdditions}</Badge>
				<Badge variant="destructive">-{totalDeletions}</Badge>
			</div>
		</header>
		<div class="divide-y">
			{#each files as file (file.path)}
				<article>
					<header class="flex flex-wrap items-center justify-between gap-2 bg-background px-4 py-2">
						<div class="min-w-0">
							<h4 class="truncate font-mono text-sm text-foreground">{file.path}</h4>
							{#if file.oldPath && file.oldPath !== file.path}
								<p class="truncate font-mono text-xs text-muted-foreground">{file.oldPath}</p>
							{/if}
						</div>
						{#if file.status}
							<Badge variant="outline">{file.status}</Badge>
						{/if}
					</header>
					<div class="overflow-x-auto">
						<table class="w-full border-collapse font-mono text-xs leading-5">
							<tbody>
								{#each file.lines as line, index (`${line.oldLine ?? ""}-${line.newLine ?? ""}-${index}`)}
									<tr class={lineClasses(line.type)}>
										<td class="w-12 select-none border-r px-2 text-right text-muted-foreground">{line.oldLine ?? ""}</td>
										<td class="w-12 select-none border-r px-2 text-right text-muted-foreground">{line.newLine ?? ""}</td>
										<td class="w-6 select-none px-2 text-muted-foreground">{marker(line.type)}</td>
										<td class="min-w-96 whitespace-pre px-2">{line.content || " "}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</section>
