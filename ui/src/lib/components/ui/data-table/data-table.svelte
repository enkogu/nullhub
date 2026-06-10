<script lang="ts" module>
	export type DataTableRow = Record<string, unknown>;
	export type DataTableAlign = "start" | "center" | "end";
	export type DataTableSortDirection = "asc" | "desc";
	export type DataTableSortValue = string | number | boolean | Date | null | undefined;
	export type DataTableCellValue = string | number | boolean | null | undefined;

	export type DataTableSortState = {
		key: string;
		direction: DataTableSortDirection;
	} | null;

	export type DataTableColumn<T extends DataTableRow = DataTableRow> = {
		key: string;
		label: string;
		sortable?: boolean;
		align?: DataTableAlign;
		class?: string;
		headerClass?: string;
		format?: (value: unknown, row: T) => DataTableCellValue;
		sortValue?: (row: T) => DataTableSortValue;
	};

	export type DataTableProps<T extends DataTableRow = DataTableRow> = {
		columns: DataTableColumn<T>[];
		rows: T[];
		caption?: string;
		loading?: boolean;
		loadingRows?: number;
		loadingLabel?: string;
		emptyTitle?: string;
		emptyDescription?: string;
		rowKey?: string | ((row: T, index: number) => string | number);
		initialSort?: DataTableSortState;
		onRowClick?: (row: T, index: number) => void;
		class?: string;
	};
</script>

<script lang="ts" generics="T extends DataTableRow = DataTableRow">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import { cn } from "$lib/utils.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";

	let {
		columns,
		rows,
		caption,
		loading = false,
		loadingRows = 5,
		loadingLabel = "Loading data",
		emptyTitle = "No results",
		emptyDescription = "Try changing filters or adding a new record.",
		rowKey,
		initialSort = null,
		onRowClick,
		class: className,
	}: DataTableProps<T> = $props();

	let sortState = $state<DataTableSortState>(null);

	$effect.pre(() => {
		if (sortState === null && initialSort !== null) {
			sortState = initialSort;
		}
	});

	let loadingRange = $derived(Array.from({ length: Math.max(1, loadingRows) }));
	let visibleRows = $derived.by(() => {
		const currentSort = sortState;
		if (!currentSort) return rows;

		const column = columns.find((item) => item.key === currentSort.key);
		if (!column) return rows;

		const direction = currentSort.direction === "asc" ? 1 : -1;
		return [...rows].sort(
			(left, right) => compareSortValues(getSortValue(left, column), getSortValue(right, column)) * direction,
		);
	});

	function toggleSort(column: DataTableColumn<T>) {
		if (!column.sortable) return;

		if (sortState?.key === column.key) {
			sortState = {
				key: column.key,
				direction: sortState.direction === "asc" ? "desc" : "asc",
			};
			return;
		}

		sortState = { key: column.key, direction: "asc" };
	}

	function getSortValue(row: T, column: DataTableColumn<T>): DataTableSortValue {
		if (column.sortValue) return column.sortValue(row);
		const value = row[column.key];
		if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
			return value;
		}
		return value == null ? null : String(value);
	}

	function compareSortValues(leftValue: DataTableSortValue, rightValue: DataTableSortValue): number {
		if (leftValue == null && rightValue == null) return 0;
		if (leftValue == null) return 1;
		if (rightValue == null) return -1;

		const left = leftValue instanceof Date ? leftValue.getTime() : leftValue;
		const right = rightValue instanceof Date ? rightValue.getTime() : rightValue;

		if (typeof left === "number" && typeof right === "number") return left - right;
		if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);

		return String(left).localeCompare(String(right), undefined, {
			numeric: true,
			sensitivity: "base",
		});
	}

	function formatCell(row: T, column: DataTableColumn<T>): string {
		const value = column.format ? column.format(row[column.key], row) : row[column.key];
		if (value == null) return "";
		if (typeof value === "boolean") return value ? "Yes" : "No";
		return String(value);
	}

	function rowIdentifier(row: T, index: number): string {
		if (typeof rowKey === "function") return String(rowKey(row, index));
		if (rowKey && row[rowKey] != null) return String(row[rowKey]);
		return String(index);
	}

	function alignClass(align: DataTableAlign = "start"): string {
		if (align === "center") return "text-center";
		if (align === "end") return "text-right";
		return "text-left";
	}

	function ariaSort(column: DataTableColumn<T>): "ascending" | "descending" | "none" | undefined {
		if (!column.sortable) return undefined;
		if (sortState?.key !== column.key) return "none";
		return sortState.direction === "asc" ? "ascending" : "descending";
	}

	function handleRowClick(row: T, index: number) {
		onRowClick?.(row, index);
	}

	function handleRowKeydown(event: KeyboardEvent, row: T, index: number) {
		if (!onRowClick || (event.key !== "Enter" && event.key !== " ")) return;
		event.preventDefault();
		onRowClick(row, index);
	}
</script>

<div data-slot="data-table" class={cn("w-full overflow-hidden rounded-md border bg-background", className)} aria-busy={loading}>
	<div class="w-full overflow-x-auto">
		<table class="w-full caption-bottom text-sm">
			{#if caption}
				<caption class="sr-only">{caption}</caption>
			{/if}
			<thead class="bg-muted/50">
				<tr class="border-b">
					{#each columns as column (column.key)}
						<th
							scope="col"
							aria-sort={ariaSort(column)}
							class={cn(
								"text-muted-foreground h-10 px-4 align-middle text-xs font-medium whitespace-nowrap",
								alignClass(column.align),
								column.headerClass,
							)}
						>
							{#if column.sortable}
								<Button
									variant="ghost"
									size="sm"
									class={cn(
										"text-muted-foreground hover:text-foreground -ml-2 h-8 gap-1 px-2 text-xs font-medium",
										column.align === "end" && "ml-auto -mr-2",
										column.align === "center" && "mx-auto",
									)}
									aria-label={`Sort by ${column.label}`}
									onclick={() => toggleSort(column)}
								>
									<span>{column.label}</span>
									{#if sortState?.key === column.key && sortState.direction === "asc"}
										<ArrowUpIcon class="size-3.5" aria-hidden="true" />
									{:else if sortState?.key === column.key && sortState.direction === "desc"}
										<ArrowDownIcon class="size-3.5" aria-hidden="true" />
									{:else}
										<ChevronsUpDownIcon class="size-3.5" aria-hidden="true" />
									{/if}
								</Button>
							{:else}
								{column.label}
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody data-slot="data-table-body">
				{#if loading}
					{#each loadingRange as _, rowIndex (rowIndex)}
						<tr class="border-b last:border-b-0">
							{#each columns as column (column.key)}
								<td class={cn("h-12 px-4 align-middle", alignClass(column.align), column.class)}>
									<Skeleton
										class={cn("h-4", column.align === "end" ? "ml-auto w-16" : "w-full max-w-40")}
										aria-label={loadingLabel}
									/>
								</td>
							{/each}
						</tr>
					{/each}
				{:else if visibleRows.length === 0}
					<tr>
						<td colspan={Math.max(columns.length, 1)} class="h-32 px-4 text-center">
							<div class="mx-auto flex max-w-sm flex-col items-center gap-1">
								<p class="text-foreground text-sm font-medium">{emptyTitle}</p>
								<p class="text-muted-foreground text-sm">{emptyDescription}</p>
							</div>
						</td>
					</tr>
				{:else}
					{#each visibleRows as row, index (rowIdentifier(row, index))}
						<tr
							class={cn(
								"border-b transition-colors last:border-b-0",
								onRowClick && "hover:bg-muted/50 focus-visible:ring-ring/50 cursor-pointer outline-none focus-visible:ring-[3px]",
							)}
							data-clickable={onRowClick ? true : undefined}
							role={onRowClick ? "button" : undefined}
							tabindex={onRowClick ? 0 : undefined}
							onclick={() => handleRowClick(row, index)}
							onkeydown={(event) => handleRowKeydown(event, row, index)}
						>
							{#each columns as column (column.key)}
								<td
									class={cn(
										"text-foreground h-12 px-4 align-middle whitespace-nowrap",
										alignClass(column.align),
										column.class,
									)}
								>
									{formatCell(row, column)}
								</td>
							{/each}
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>
