import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { marketPackages } from "$lib/components/market/fixtures";
import NewSpaceFlow, { type NewSpaceSubmitInput } from "./NewSpaceFlow.svelte";

const blueprints = marketPackages.filter((pkg) => pkg.scale === "blueprint" || pkg.itemType === "blueprint");

test("submits an empty Space create request", async () => {
  const onSubmit = vi.fn<(input: NewSpaceSubmitInput) => void>();
  const screen = await render(NewSpaceFlow, { props: { blueprints, state: "populated", onSubmit } });

  await screen.getByLabelText("Space name").fill("Launch Room");
  await screen.getByRole("radio", { name: /Empty Space/ }).click();
  await screen.getByRole("button", { name: /Create empty Space/ }).click();

  expect(onSubmit).toHaveBeenCalledWith({ name: "Launch Room", mode: "empty", blueprintId: undefined });
});

test("submits the selected Blueprint handoff", async () => {
  const onSubmit = vi.fn<(input: NewSpaceSubmitInput) => void>();
  const screen = await render(NewSpaceFlow, {
    props: { blueprints, state: "populated", initialMode: "blueprint", onSubmit },
  });

  await screen.getByLabelText("Space name").fill("Support Desk");
  await expect.element(screen.getByRole("button", { name: /Space Operations Blueprint/ })).toBeVisible();
  await screen.getByRole("button", { name: /Create and open installer/ }).click();

  expect(onSubmit).toHaveBeenCalledWith({
    name: "Support Desk",
    mode: "blueprint",
    blueprintId: "builtin.space-operations",
  });
});

test("renders loading, empty, and error Blueprint states", async () => {
  const loading = await render(NewSpaceFlow, {
    props: { blueprints: [], state: "loading", initialMode: "blueprint" },
  });
  await expect.element(loading.getByText("Loading Blueprints")).toBeVisible();

  const empty = await render(NewSpaceFlow, {
    props: { blueprints: [], state: "empty", initialMode: "blueprint" },
  });
  await expect.element(empty.getByText("No Blueprints available")).toBeVisible();

  const error = await render(NewSpaceFlow, {
    props: {
      blueprints: [],
      state: "error",
      initialMode: "blueprint",
      error: new Error("Catalog unavailable."),
    },
  });
  await expect.element(error.getByText("Blueprints unavailable")).toBeVisible();
  await expect.element(error.getByText("Catalog unavailable.")).toBeVisible();
});

test("requires a Blueprint before submitting in Blueprint mode", async () => {
  const onSubmit = vi.fn<(input: NewSpaceSubmitInput) => void>();
  const screen = await render(NewSpaceFlow, {
    props: { blueprints: [], state: "empty", initialMode: "blueprint", onSubmit },
  });

  await screen.getByLabelText("Space name").fill("Support Desk");

  const submit = await screen.getByRole("button", { name: /Create and open installer/ }).element();
  expect(submit).toBeDisabled();
  expect(onSubmit).not.toHaveBeenCalled();
});
