<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import WizardShell, { type WizardShellStep } from "./WizardShell.svelte";

	const { Story } = defineMeta({
		title: "Components/WizardShell",
		component: WizardShell,
	});

	const steps: WizardShellStep[] = [
		{
			id: "target",
			title: "Choose target",
			description: "Select where the kit will be installed.",
			completed: true,
		},
		{
			id: "provider",
			title: "Provider",
			description: "Review model and key requirements.",
		},
		{
			id: "review",
			title: "Review",
			description: "Confirm blast radius and start install.",
			optional: true,
		},
	];
</script>

{#snippet wizardTemplate(args)}
	<WizardShell {...args}>
		{#snippet children(step)}
			<div class="rounded-md border bg-muted/40 p-4 text-sm text-foreground">
				Step content for {step.title}
			</div>
		{/snippet}
	</WizardShell>
{/snippet}

<Story
	name="Populated"
	args={{
		title: "Install wizard",
		description: "Shared shell for install, hire, and package flows.",
		steps,
		activeStepId: "provider",
		resumeStepId: "provider",
	}}
	template={wizardTemplate}
/>
<Story name="Loading" args={{ state: "loading" }} template={wizardTemplate} />
<Story name="Empty" args={{ state: "empty" }} template={wizardTemplate} />
<Story name="Error" args={{ state: "error", errorMessage: "Wizard metadata failed." }} template={wizardTemplate} />
