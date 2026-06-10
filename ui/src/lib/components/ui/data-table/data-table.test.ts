import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { DataTable, type DataTableColumn } from "./index.js";

type ComponentRow = {
	name: string;
	surface: string;
	owner: string;
	runs: number;
};

const columns: DataTableColumn<ComponentRow>[] = [
	{ key: "name", label: "Name", sortable: true },
	{ key: "surface", label: "Surface", sortable: true },
	{ key: "owner", label: "Owner" },
	{ key: "runs", label: "Runs", sortable: true, align: "end" },
];

const rows: ComponentRow[] = [
	{ name: "Zig runtime smoke", surface: "System", owner: "Runtime", runs: 5 },
	{ name: "Svelte shared component", surface: "Work", owner: "Frontend", runs: 27 },
	{ name: "API fixture harness", surface: "Inbox", owner: "Product", runs: 12 },
];

function tableNames(container: ParentNode): string[] {
	return Array.from(container.querySelectorAll<HTMLTableRowElement>('[data-slot="data-table-body"] tr'))
		.map((row) => row.querySelector("td")?.textContent?.trim() ?? "")
		.filter(Boolean);
}

test("sorts rows when a sortable header is clicked", async () => {
	const screen = await render(DataTable, {
		columns,
		rows,
		rowKey: "name",
	});

	expect(tableNames(screen.container)).toEqual([
		"Zig runtime smoke",
		"Svelte shared component",
		"API fixture harness",
	]);

	const sortByName = screen.getByRole("button", { name: "Sort by Name" });
	await sortByName.click();

	expect(tableNames(screen.container)).toEqual([
		"API fixture harness",
		"Svelte shared component",
		"Zig runtime smoke",
	]);
	expect(screen.container.querySelector('th[aria-sort="ascending"]')?.textContent).toContain("Name");

	await sortByName.click();

	expect(tableNames(screen.container)).toEqual([
		"Zig runtime smoke",
		"Svelte shared component",
		"API fixture harness",
	]);
	expect(screen.container.querySelector('th[aria-sort="descending"]')?.textContent).toContain("Name");
});

test("calls row click handler with the selected row", async () => {
	const onRowClick = vi.fn();
	const screen = await render(DataTable, {
		columns,
		rows,
		rowKey: "name",
		onRowClick,
	});

	const selectedRow = Array.from(screen.container.querySelectorAll<HTMLTableRowElement>('[data-slot="data-table-body"] tr')).find((row) =>
		row.textContent?.includes("Svelte shared component"),
	);
	expect(selectedRow).toBeTruthy();

	selectedRow?.click();

	expect(onRowClick).toHaveBeenCalledTimes(1);
	expect(onRowClick).toHaveBeenCalledWith(rows[1], 1);
});
