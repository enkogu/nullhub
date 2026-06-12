import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import LoopGalleryPanel from "./LoopGalleryPanel.svelte";

test("links marketplace action to the canonical Market route", async () => {
  const screen = await render(LoopGalleryPanel, {
    props: {
      oninstall: () => {},
    },
  });

  const link = screen.getByRole("link", { name: "Browse Marketplace" });
  await expect.element(link).toBeVisible();
  const element = await link.element();
  expect(element.getAttribute("href")).toBe("/market/loops");
});
