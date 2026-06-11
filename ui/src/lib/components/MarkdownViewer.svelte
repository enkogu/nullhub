<script lang="ts" module>
	export type MarkdownViewerState = "loading" | "empty" | "error" | "populated";
</script>

<script lang="ts">
	import { marked } from "marked";
	import { cn } from "$lib/utils.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import EmptyState from "./EmptyState.svelte";
	import ErrorState from "./ErrorState.svelte";

	let {
		markdown = "",
		state,
		stripFrontmatter = true,
		emptyTitle = "No Markdown content",
		emptyDescription = "Document content will appear here when available.",
		errorTitle = "Markdown unavailable",
		errorMessage = "This document could not be rendered.",
		ariaLabel = "Rendered Markdown",
		class: className,
	}: {
		markdown?: string;
		state?: MarkdownViewerState;
		stripFrontmatter?: boolean;
		emptyTitle?: string;
		emptyDescription?: string;
		errorTitle?: string;
		errorMessage?: string;
		ariaLabel?: string;
		class?: string;
	} = $props();

	let resolvedState = $derived(state ?? (markdown.trim() ? "populated" : "empty"));
	let renderedMarkdown = $derived(renderMarkdown(markdown, stripFrontmatter));

	function renderMarkdown(source: string, removeFrontmatter: boolean): string {
		const body = removeFrontmatter ? stripYamlFrontmatter(source) : source;
		return sanitizeHtml(marked.parse(escapeRawHtml(body), { gfm: true, async: false }) as string);
	}

	function stripYamlFrontmatter(source: string): string {
		return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "");
	}

	function escapeRawHtml(source: string): string {
		return source.replace(/&/gu, "&amp;").replace(/</gu, "&lt;");
	}

	function decodeHtmlEntities(value: string): string {
		const named: Record<string, string> = {
			amp: "&",
			apos: "'",
			colon: ":",
			gt: ">",
			lt: "<",
			quot: '"',
		};
		return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
			const lower = entity.toLowerCase();
			if (lower.startsWith("#x")) {
				const codePoint = Number.parseInt(lower.slice(2), 16);
				return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
			}
			if (lower.startsWith("#")) {
				const codePoint = Number.parseInt(lower.slice(1), 10);
				return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
			}
			return named[lower] ?? match;
		});
	}

	function isUnsafeUrlAttribute(value: string): boolean {
		const normalized = decodeHtmlEntities(value)
			.trim()
			.replace(/[\u0000-\u001f\u007f\s]+/gu, "")
			.toLowerCase();
		if (normalized.startsWith("javascript:")) return true;
		if (normalized.startsWith("data:")) {
			return !/^data:image\/(?:png|jpeg|gif|webp)(?:[;,]|$)/iu.test(normalized);
		}
		return false;
	}

	function sanitizeUrlAttribute(match: string, attr: string, quote: string, value: string): string {
		if (isUnsafeUrlAttribute(value)) return `${attr}=${quote}#${quote}`;
		return match;
	}

	function sanitizeHtml(html: string): string {
		return html
			.replace(/<\/?(?:script|iframe|object|embed|style|link|meta|base)\b[^>]*>/giu, "")
			.replace(/\son[a-z]+\s*=\s*"[^"]*"/giu, "")
			.replace(/\son[a-z]+\s*=\s*'[^']*'/giu, "")
			.replace(/\son[a-z]+\s*=\s*[^\s>]+/giu, "")
			.replace(/\b(href|src)\s*=\s*(")([^"]*)"/giu, sanitizeUrlAttribute)
			.replace(/\b(href|src)\s*=\s*(')([^']*)'/giu, sanitizeUrlAttribute);
	}
</script>

<section data-slot="markdown-viewer" class={cn("rounded-lg border bg-card text-card-foreground", className)} aria-busy={resolvedState === "loading"}>
	{#if resolvedState === "loading"}
		<div class="space-y-3 p-5">
			<Skeleton class="h-6 w-1/2" aria-label="Loading markdown" />
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-11/12" />
			<Skeleton class="h-4 w-8/12" />
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
		<div
			aria-label={ariaLabel}
			class="space-y-4 p-5 text-sm leading-6 text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_th]:text-left"
		>
			{@html renderedMarkdown}
		</div>
	{/if}
</section>
