import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import WizardShell, { type WizardShellStep } from "./WizardShell.svelte";

const steps: WizardShellStep[] = [
	{
		id: "target",
		title: "Choose target",
		description: "Select an install target.",
	},
	{
		id: "provider",
		title: "Provider",
		description: "Configure model access.",
	},
];

test("blocks navigation when step validation fails", async () => {
	const validateStep = vi.fn(() => "Select a target before continuing.");
	const screen = await render(WizardShell, {
		steps,
		activeStepId: "target",
		validateStep,
	});

	await screen.getByRole("button", { name: "Continue" }).click();
	expect(validateStep).toHaveBeenCalledWith(steps[0]);
	await expect.element(screen.getByText("Select a target before continuing.")).toBeVisible();
	await expect.element(screen.getByRole("heading", { name: "Choose target" })).toBeVisible();
});

test("advances, resumes, and completes wizard steps", async () => {
	const onStepChange = vi.fn();
	const onResume = vi.fn();
	const onComplete = vi.fn();
	const screen = await render(WizardShell, {
		steps,
		activeStepId: "target",
		resumeStepId: "provider",
		validateStep: () => true,
		onStepChange,
		onResume,
		onComplete,
	});

	await screen.getByRole("button", { name: "Resume" }).click();
	expect(onResume).toHaveBeenCalledWith(steps[1]);
	await expect.element(screen.getByRole("heading", { name: "Provider" })).toBeVisible();

	await screen.getByRole("button", { name: "Complete" }).click();
	expect(onComplete).toHaveBeenCalledTimes(1);
	expect(onStepChange).toHaveBeenCalledWith(steps[1]);
});

test("renders loading, empty, and error states", async () => {
	const loading = await render(WizardShell, { state: "loading" });
	expect(loading.container.querySelector('[aria-label="Loading wizard"]')).not.toBeNull();

	const empty = await render(WizardShell, { state: "empty" });
	await expect.element(empty.getByText("No steps configured")).toBeVisible();

	const error = await render(WizardShell, {
		state: "error",
		errorMessage: "Wizard failed.",
	});
	await expect.element(error.getByText("Wizard failed.")).toBeVisible();
});
