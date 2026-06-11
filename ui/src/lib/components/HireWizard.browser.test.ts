import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import HireWizard from "./HireWizard.svelte";

vi.mock("$lib/api/client", () => ({
  api: {
    postWizard: vi.fn().mockResolvedValue({ status: "ok", instance: "sdr-agent" }),
  },
}));

test("submits the hire wizard payload", async () => {
  const { api } = await import("$lib/api/client");
  const screen = await render(HireWizard, {
    component: "nullclaw",
    existingNames: ["support-agent"],
    availableModels: ["google/gemma-4-31b-it:free", "openai/gpt-5.5"],
  });

  await screen.getByLabelText("Agent name").fill("sdr-agent");
  await screen.getByRole("button", { name: "Continue" }).click();

  await screen.getByLabelText("Role").fill("sales");
  await screen.getByRole("button", { name: "Continue" }).click();

  const modelSelect = screen.container.querySelector<HTMLSelectElement>("select");
  modelSelect!.value = "openai/gpt-5.5";
  modelSelect!.dispatchEvent(new Event("change", { bubbles: true }));
  await screen.getByRole("button", { name: "Continue" }).click();

  await screen.getByLabelText("Skills").fill("qualification, follow-up");
  await screen.getByRole("button", { name: "Continue" }).click();
  await screen.getByRole("button", { name: "Hire", exact: true }).click();

  expect(api.postWizard).toHaveBeenCalledWith("nullclaw", {
    instance_name: "sdr-agent",
    version: "latest",
    role: "sales",
    model: "openai/gpt-5.5",
    skills: ["qualification", "follow-up"],
  });
  await expect.element(screen.getByText("Created sdr-agent.")).toBeVisible();
});
