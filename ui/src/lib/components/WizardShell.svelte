<script lang="ts" module>
	import type { Snippet } from "svelte";

	export type WizardShellState = "loading" | "empty" | "error" | "populated";
	export type WizardStepStatus = "complete" | "current" | "pending" | "blocked" | "error";

	export type WizardShellStep = {
		id: string;
		title: string;
		description?: string;
		optional?: boolean;
		completed?: boolean;
		disabled?: boolean;
		error?: string;
	};

	export type WizardShellValidationResult = boolean | string | { valid: boolean; message?: string };
</script>

<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import CheckIcon from "@lucide/svelte/icons/check";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import { cn } from "$lib/utils.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Progress } from "$lib/components/ui/progress/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import EmptyState from "./EmptyState.svelte";
	import ErrorState from "./ErrorState.svelte";

	let {
		steps = [],
		activeStepId = $bindable<string | undefined>(),
		resumeStepId,
		state: componentState,
		title = "Setup wizard",
		description,
		backLabel = "Back",
		nextLabel = "Continue",
		completeLabel = "Complete",
		resumeLabel = "Resume",
		emptyTitle = "No steps configured",
		emptyDescription = "Wizard steps will appear here when available.",
		errorTitle = "Wizard unavailable",
		errorMessage = "This wizard could not be loaded.",
		validateStep,
		onStepChange,
		onComplete,
		onResume,
		children,
		class: className,
	}: {
		steps?: WizardShellStep[];
		activeStepId?: string;
		resumeStepId?: string;
		state?: WizardShellState;
		title?: string;
		description?: string;
		backLabel?: string;
		nextLabel?: string;
		completeLabel?: string;
		resumeLabel?: string;
		emptyTitle?: string;
		emptyDescription?: string;
		errorTitle?: string;
		errorMessage?: string;
		validateStep?: (step: WizardShellStep) => WizardShellValidationResult | Promise<WizardShellValidationResult>;
		onStepChange?: (step: WizardShellStep) => void;
		onComplete?: () => void;
		onResume?: (step: WizardShellStep) => void;
		children?: Snippet<[WizardShellStep]>;
		class?: string;
	} = $props();

	let validationMessage = $state("");
	let validating = $state(false);
	let resolvedState = $derived(componentState ?? (steps.length > 0 ? "populated" : "empty"));
	let activeIndex = $derived(Math.max(0, steps.findIndex((step) => step.id === activeStepId)));
	let activeStep = $derived(steps[activeIndex] ?? steps[0]);
	let completedCount = $derived(steps.filter((step) => step.completed).length);
	let progressValue = $derived(steps.length === 0 ? 0 : Math.round((completedCount / steps.length) * 100));
	let isLastStep = $derived(activeIndex >= steps.length - 1);
	let canGoBack = $derived(activeIndex > 0 && !validating);
	let resumeStep = $derived(steps.find((step) => step.id === resumeStepId));

	$effect(() => {
		if (!activeStepId && steps[0]) {
			activeStepId = steps[0].id;
		}
	});

	function stepStatus(step: WizardShellStep, index: number): WizardStepStatus {
		if (step.error) return "error";
		if (step.id === activeStep?.id) return "current";
		if (step.completed) return "complete";
		if (step.disabled || index > activeIndex + 1) return "blocked";
		return "pending";
	}

	function normalizeValidation(result: WizardShellValidationResult): { valid: boolean; message: string } {
		if (typeof result === "boolean") return { valid: result, message: result ? "" : "Complete this step before continuing." };
		if (typeof result === "string") return { valid: result.length === 0, message: result };
		return { valid: result.valid, message: result.message ?? (result.valid ? "" : "Complete this step before continuing.") };
	}

	function setActive(step: WizardShellStep) {
		if (step.disabled) return;
		activeStepId = step.id;
		validationMessage = "";
		onStepChange?.(step);
	}

	async function continueWizard() {
		if (!activeStep || validating) return;
		validating = true;
		validationMessage = "";
		const result = normalizeValidation(validateStep ? await validateStep(activeStep) : true);
		validating = false;
		if (!result.valid) {
			validationMessage = result.message;
			return;
		}
		if (isLastStep) {
			onComplete?.();
			return;
		}
		const next = steps[activeIndex + 1];
		if (next) setActive(next);
	}

	function goBack() {
		const previous = steps[activeIndex - 1];
		if (previous) setActive(previous);
	}

	function resume() {
		if (!resumeStep) return;
		setActive(resumeStep);
		onResume?.(resumeStep);
	}
</script>

<section data-slot="wizard-shell" class={cn("rounded-lg border bg-card text-card-foreground", className)} aria-busy={resolvedState === "loading" || validating}>
	{#if resolvedState === "loading"}
		<div class="space-y-5 p-5">
			<Skeleton class="h-6 w-48" aria-label="Loading wizard" />
			<Skeleton class="h-2 w-full" />
			<div class="grid gap-3 md:grid-cols-[16rem_minmax(0,1fr)]">
				<Skeleton class="h-48" />
				<Skeleton class="h-48" />
			</div>
		</div>
	{:else if resolvedState === "error"}
		<div class="p-4">
			<ErrorState title={errorTitle} message={errorMessage} compact />
		</div>
	{:else if resolvedState === "empty"}
		<div class="p-4">
			<EmptyState title={emptyTitle} description={emptyDescription} icon="plus" tone="neutral" />
		</div>
	{:else}
		<header class="space-y-3 border-b px-5 py-4">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0">
					<h2 class="text-lg font-semibold text-foreground">{title}</h2>
					{#if description}
						<p class="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
					{/if}
				</div>
				{#if resumeStep && resumeStep.id !== activeStep?.id}
					<Button variant="outline" size="sm" onclick={resume}>
						<RotateCcwIcon class="size-4" aria-hidden="true" />
						{resumeLabel}
					</Button>
				{/if}
			</div>
			<div class="flex items-center gap-3">
				<Progress value={progressValue} aria-label="Wizard progress" />
				<span class="font-mono text-xs text-muted-foreground">{completedCount}/{steps.length}</span>
			</div>
		</header>
		<div class="grid gap-0 md:grid-cols-[17rem_minmax(0,1fr)]">
			<ol class="border-b p-3 md:border-r md:border-b-0">
				{#each steps as step, index (step.id)}
					{@const status = stepStatus(step, index)}
					<li>
						<button
							type="button"
							class={cn(
								"flex w-full gap-3 rounded-md px-3 py-2 text-left transition-colors",
								status === "current" && "bg-primary/10 text-foreground",
								status !== "current" && "hover:bg-muted",
								step.disabled && "cursor-not-allowed opacity-60",
							)}
							disabled={step.disabled || status === "blocked"}
							aria-current={status === "current" ? "step" : undefined}
							onclick={() => setActive(step)}
						>
							<span
								class={cn(
									"mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs",
									status === "complete" && "border-ok bg-ok text-primary-foreground",
									status === "current" && "border-primary bg-primary text-primary-foreground",
									status === "error" && "border-destructive bg-destructive text-destructive-foreground",
									(status === "pending" || status === "blocked") && "border-border bg-background text-muted-foreground",
								)}
							>
								{#if status === "complete"}
									<CheckIcon class="size-3.5" aria-hidden="true" />
								{:else}
									{index + 1}
								{/if}
							</span>
							<span class="min-w-0">
								<span class="block truncate text-sm font-medium">{step.title}</span>
								{#if step.description}
									<span class="mt-0.5 block text-xs leading-5 text-muted-foreground">{step.description}</span>
								{/if}
								{#if step.optional}
									<span class="mt-1 block text-xs text-muted-foreground">Optional</span>
								{/if}
								{#if step.error}
									<span class="mt-1 block text-xs text-destructive">{step.error}</span>
								{/if}
							</span>
						</button>
					</li>
				{/each}
			</ol>
			<div class="min-w-0 p-5">
				{#if activeStep}
					<div class="mb-5">
						<h3 class="text-base font-semibold text-foreground">{activeStep.title}</h3>
						{#if activeStep.description}
							<p class="mt-1 text-sm leading-5 text-muted-foreground">{activeStep.description}</p>
						{/if}
					</div>
					{#if children}
						{@render children(activeStep)}
					{:else}
						<p class="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">No step content supplied.</p>
					{/if}
					{#if validationMessage}
						<p class="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
							{validationMessage}
						</p>
					{/if}
					<footer class="mt-6 flex flex-wrap justify-between gap-2 border-t pt-4">
						<Button variant="outline" size="sm" onclick={goBack} disabled={!canGoBack}>
							<ArrowLeftIcon class="size-4" aria-hidden="true" />
							{backLabel}
						</Button>
						<Button size="sm" onclick={continueWizard} disabled={validating}>
							{validating ? "Validating..." : isLastStep ? completeLabel : nextLabel}
							<ArrowRightIcon class="size-4" aria-hidden="true" />
						</Button>
					</footer>
				{/if}
			</div>
		</div>
	{/if}
</section>
