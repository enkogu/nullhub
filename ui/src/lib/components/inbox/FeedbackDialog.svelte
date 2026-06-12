<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import { Dialog } from "$lib/components/ui/dialog/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Textarea } from "$lib/components/ui/textarea/index.js";
	import { feedbackError, MIN_FEEDBACK_LENGTH } from "./inbox";

	let {
		open = $bindable(false),
		title = "Return for rework",
		description = "Explain what must change before this work can be approved.",
		submitLabel = "Return work",
		loading = false,
		onSubmit,
		onCancel,
		class: className,
	}: {
		open?: boolean;
		title?: string;
		description?: string;
		submitLabel?: string;
		loading?: boolean;
		onSubmit?: (feedback: string) => void;
		onCancel?: () => void;
		class?: string;
	} = $props();

	let feedback = $state("");
	let touched = $state(false);

	let validationError = $derived(feedbackError(feedback));

	$effect(() => {
		if (!open) {
			feedback = "";
			touched = false;
		}
	});

	function cancel() {
		onCancel?.();
		open = false;
	}

	function submit() {
		touched = true;
		if (validationError) return;
		onSubmit?.(feedback.trim());
		open = false;
	}
</script>

{#snippet footer()}
	<Button variant="outline" size="sm" onclick={cancel} disabled={loading}>Cancel</Button>
	<Button size="sm" onclick={submit} disabled={loading || Boolean(validationError)}>
		{loading ? "Working..." : submitLabel}
	</Button>
{/snippet}

<Dialog bind:open {title} {description} footer={footer} size="md" class={className}>
	<div class="space-y-2">
		<Label for="inbox-feedback">Feedback (at least {MIN_FEEDBACK_LENGTH} characters)</Label>
		<Textarea
			id="inbox-feedback"
			bind:value={feedback}
			rows={4}
			placeholder="What needs to change before this can be approved?"
			aria-invalid={touched && validationError ? "true" : undefined}
			onblur={() => (touched = true)}
		/>
		{#if touched && validationError}
			<p class="text-destructive text-sm" role="alert">{validationError}</p>
		{/if}
	</div>
</Dialog>
