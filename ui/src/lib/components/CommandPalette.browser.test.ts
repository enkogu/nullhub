import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import CommandPalette, { type CommandPaletteCreateTask, type CommandPaletteNavigate } from "./CommandPalette.svelte";

function nextFrame() {
	return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function setSearchValue(input: HTMLInputElement, value: string) {
	input.focus();
	input.value = value;
	input.dispatchEvent(
		new InputEvent("input", {
			bubbles: true,
			data: value,
			inputType: "insertText",
		}),
	);
	await nextFrame();
}

async function pressKey(input: HTMLInputElement, key: string) {
	input.dispatchEvent(
		new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key,
		}),
	);
	await nextFrame();
}

test("renders product navigation commands and static search stubs", async () => {
	const screen = await render(CommandPalette, {
		open: true,
		navigate: vi.fn<CommandPaletteNavigate>(),
		createTask: vi.fn<CommandPaletteCreateTask>(),
	});

	await expect.element(screen.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
	await expect.element(screen.getByText("Home", { exact: true })).toBeVisible();
	await expect.element(screen.getByText("Inbox", { exact: true })).toBeVisible();
	await expect.element(screen.getByText("Work", { exact: true })).toBeVisible();
	await expect.element(screen.getByText("Orders", { exact: true })).toBeVisible();
	await expect.element(screen.getByText("Team", { exact: true })).toBeVisible();
	await expect.element(screen.getByText("Market", { exact: true })).toBeVisible();
	await expect.element(screen.getByText("System", { exact: true })).toBeVisible();
	await expect.element(screen.getByText("New space", { exact: true })).toBeVisible();
	await expect.element(screen.getByText("Search orders", { exact: true })).toBeVisible();
	await expect.element(screen.getByText("Search agents", { exact: true })).toBeVisible();
	await expect.element(screen.getByLabelText("Command search")).toHaveFocus();
});

test("selects navigation commands", async () => {
	const navigate = vi.fn<CommandPaletteNavigate>();
	const screen = await render(CommandPalette, {
		open: true,
		navigate,
		createTask: vi.fn<CommandPaletteCreateTask>(),
	});

	await screen.getByText("Work", { exact: true }).click();
	await nextFrame();

	expect(navigate).toHaveBeenCalledWith("/work");
});

test("filters and activates navigation commands from the keyboard", async () => {
	const navigate = vi.fn<CommandPaletteNavigate>();
	const screen = await render(CommandPalette, {
		open: true,
		navigate,
		createTask: vi.fn<CommandPaletteCreateTask>(),
	});
	const input = screen.container.querySelector<HTMLInputElement>('input[aria-label="Command search"]');
	expect(input).not.toBeNull();

	await setSearchValue(input as HTMLInputElement, "team");
	await expect.element(screen.getByText("Team", { exact: true })).toBeVisible();
	expect(screen.container.textContent).not.toContain("Home");

	await pressKey(input as HTMLInputElement, "Enter");

	expect(navigate).toHaveBeenCalledWith("/team");
});

test("creates a NullTickets task from capture mode", async () => {
	const createTask = vi.fn<CommandPaletteCreateTask>().mockResolvedValue({ id: "task-1" });
	const screen = await render(CommandPalette, {
		open: true,
		ticketsInstance: "tickets-main",
		navigate: vi.fn<CommandPaletteNavigate>(),
		createTask,
	});

	await screen.getByText("New task").click();
	await expect.element(screen.getByLabelText("Loop ID")).toHaveFocus();
	await screen.getByLabelText("Loop ID").fill("loop-ops");
	await screen.getByLabelText("Title").fill("Review escalation");
	await screen.getByLabelText("Description").fill("Check failed order evidence.");
	await screen.getByLabelText("Priority").fill("2");
	await screen.getByRole("button", { name: "Create task" }).click();
	await expect.element(screen.getByRole("status")).toHaveTextContent("Task created.");

	expect(createTask).toHaveBeenCalledWith({
		instance: "tickets-main",
		pipelineId: "loop-ops",
		title: "Review escalation",
		description: "Check failed order evidence.",
		priority: 2,
	});
});

test("restores search focus after leaving task capture", async () => {
	const screen = await render(CommandPalette, {
		open: true,
		navigate: vi.fn<CommandPaletteNavigate>(),
		createTask: vi.fn<CommandPaletteCreateTask>(),
	});

	await screen.getByText("New task").click();
	await expect.element(screen.getByLabelText("Loop ID")).toHaveFocus();
	await screen.getByRole("button", { name: "Back" }).click();

	await expect.element(screen.getByLabelText("Command search")).toHaveFocus();
});

test("does not let command key handling intercept task form editing", async () => {
	const screen = await render(CommandPalette, {
		open: true,
		navigate: vi.fn<CommandPaletteNavigate>(),
		createTask: vi.fn<CommandPaletteCreateTask>(),
	});

	await screen.getByText("New task").click();
	const description = screen.container.querySelector<HTMLTextAreaElement>("#command-task-description");
	expect(description).not.toBeNull();

	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		key: "Enter",
	});
	description?.dispatchEvent(event);

	expect(event.defaultPrevented).toBe(false);
});
