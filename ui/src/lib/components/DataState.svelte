<script lang="ts" module>
	export type DataStateKind = "loading" | "empty" | "error" | "populated";

	export type DataStateErrorCopy = {
		message: string;
		details?: string;
	};

	type ApiLikeError = Error & {
		status?: number;
		body?: unknown;
	};

	function bodyMessage(body: unknown): string | undefined {
		if (!body || typeof body !== "object") return undefined;
		const record = body as Record<string, unknown>;
		if (typeof record.message === "string") return record.message;
		if (typeof record.error === "string") return record.error;
		if (record.error && typeof record.error === "object") {
			const nested = record.error as Record<string, unknown>;
			if (typeof nested.message === "string") return nested.message;
		}
		return undefined;
	}

	export function isCircuitBreakerError(error: unknown): boolean {
		if (!error || typeof error !== "object") return false;
		const body = (error as ApiLikeError).body;
		return Boolean(body && typeof body === "object" && (body as Record<string, unknown>).circuitOpen);
	}

	export function describeDataStateError(
		error: unknown,
		fallback = "The request failed before this surface could render data.",
	): DataStateErrorCopy {
		if (isCircuitBreakerError(error)) {
			const message = error instanceof Error ? error.message : undefined;
			return {
				message: "NullHub backend is temporarily unavailable. Retry once the connection recovers.",
				details: message,
			};
		}
		if (!error) return { message: fallback };
		const apiError = error as ApiLikeError;
		const message =
			bodyMessage(apiError.body) ||
			(error instanceof Error ? error.message : undefined) ||
			(typeof error === "string" ? error : undefined) ||
			fallback;
		const details = typeof apiError.status === "number" ? `HTTP ${apiError.status}` : undefined;
		return { message, details };
	}
</script>

<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "$lib/utils.js";
	import EmptyState, { type EmptyStateIcon, type EmptyStateTone } from "./EmptyState.svelte";
	import ErrorState from "./ErrorState.svelte";

	let {
		state = "empty",
		error,
		emptyTitle = "No records yet",
		emptyDescription = "Data will appear here once it is available.",
		emptyActionLabel,
		emptyActionHref,
		emptySecondaryActionLabel,
		emptySecondaryActionHref,
		emptyIcon = "inbox",
		emptyTone = "neutral",
		emptyTitleAsHeading = true,
		loadingTitle = "Loading data",
		loadingDescription = "Fetching the latest data.",
		errorTitle = "Unable to load data",
		errorMessage,
		errorDetails,
		errorFallback = "The request failed before this surface could render data.",
		retryLabel,
		retryHref,
		onRetry,
		class: className,
		children,
	}: {
		state?: DataStateKind;
		error?: unknown;
		emptyTitle?: string;
		emptyDescription?: string;
		emptyActionLabel?: string;
		emptyActionHref?: string;
		emptySecondaryActionLabel?: string;
		emptySecondaryActionHref?: string;
		emptyIcon?: EmptyStateIcon;
		emptyTone?: EmptyStateTone;
		emptyTitleAsHeading?: boolean;
		loadingTitle?: string;
		loadingDescription?: string;
		errorTitle?: string;
		errorMessage?: string;
		errorDetails?: string;
		errorFallback?: string;
		retryLabel?: string;
		retryHref?: string;
		onRetry?: () => void;
		class?: string;
		children?: Snippet;
	} = $props();

	let resolvedError = $derived(
		errorMessage || errorDetails
			? { message: errorMessage ?? errorFallback, details: errorDetails }
			: describeDataStateError(error, errorFallback),
	);
</script>

<section data-slot="data-state" class={cn("min-w-0", className)} aria-busy={state === "loading"}>
	{#if state === "loading"}
		<EmptyState title={loadingTitle} description={loadingDescription} loading />
	{:else if state === "error"}
		<ErrorState
			title={errorTitle}
			message={resolvedError.message}
			details={resolvedError.details}
			retryLabel={retryLabel}
			retryHref={retryHref}
			onRetry={onRetry}
		/>
	{:else if state === "empty"}
		<EmptyState
			title={emptyTitle}
			description={emptyDescription}
			actionLabel={emptyActionLabel}
			actionHref={emptyActionHref}
			secondaryActionLabel={emptySecondaryActionLabel}
			secondaryActionHref={emptySecondaryActionHref}
			icon={emptyIcon}
			tone={emptyTone}
			titleAsHeading={emptyTitleAsHeading}
		/>
	{:else}
		{@render children?.()}
	{/if}
</section>
