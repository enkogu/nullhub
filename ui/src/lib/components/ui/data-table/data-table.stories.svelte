<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import { DataTable, type DataTableColumn } from "./index.js";

	type RegistryRow = {
		name: string;
		surface: string;
		owner: string;
		updated: string;
		runs: number;
	};

	const columns: DataTableColumn<RegistryRow>[] = [
		{ key: "name", label: "Name", sortable: true },
		{ key: "surface", label: "Surface", sortable: true },
		{ key: "owner", label: "Owner" },
		{ key: "updated", label: "Updated", sortable: true },
		{
			key: "runs",
			label: "Runs",
			sortable: true,
			align: "end",
			format: (value) => Number(value).toLocaleString(),
		},
	];

	const rows: RegistryRow[] = [
		{
			name: "Svelte shared component",
			surface: "Work",
			owner: "Frontend",
			updated: "2026-06-10",
			runs: 24,
		},
		{
			name: "Package install result",
			surface: "Market",
			owner: "Product",
			updated: "2026-06-09",
			runs: 8,
		},
		{
			name: "Loop review queue",
			surface: "Orders",
			owner: "Runtime",
			updated: "2026-06-08",
			runs: 116,
		},
	];

	const { Story } = defineMeta({
		title: "UI/Data Table",
		component: DataTable,
	});
</script>

<script lang="ts">
	let selectedRow = $state("None");
</script>

{#snippet populatedTemplate()}
	<div class="max-w-5xl p-4">
		<DataTable
			caption="Registry results"
			{columns}
			{rows}
			rowKey="name"
			initialSort={{ key: "name", direction: "asc" }}
			onRowClick={(row) => {
				selectedRow = row.name;
			}}
		/>
		<p class="text-muted-foreground mt-3 text-sm">Selected: {selectedRow}</p>
	</div>
{/snippet}

{#snippet loadingTemplate()}
	<div class="max-w-5xl p-4">
		<DataTable
			caption="Loading registry results"
			{columns}
			rows={[]}
			loading
			loadingRows={4}
			loadingLabel="Loading registry rows"
		/>
	</div>
{/snippet}

{#snippet emptyTemplate()}
	<div class="max-w-5xl p-4">
		<DataTable
			caption="Empty registry results"
			{columns}
			rows={[]}
			emptyTitle="No registry rows"
			emptyDescription="Rows appear here after packages or work results are available."
		/>
	</div>
{/snippet}

<Story name="Populated" template={populatedTemplate} />
<Story name="Loading" template={loadingTemplate} />
<Story name="Empty" template={emptyTemplate} />
