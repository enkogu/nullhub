<script lang="ts">
	import DataState, { type DataStateKind } from "./DataState.svelte";

	let {
		state = "populated",
		error,
		onRetry,
	}: {
		state?: DataStateKind;
		error?: unknown;
		onRetry?: () => void;
	} = $props();
</script>

<DataState
	{state}
	{error}
	emptyTitle="No inbox requests"
	emptyDescription="Approvals and unresolved inputs will appear here."
	loadingTitle="Loading inbox"
	loadingDescription="Fetching inbox requests."
	errorTitle="Inbox unavailable"
	retryLabel="Retry"
	onRetry={onRetry}
>
	<article>
		<h2>Loaded inbox item</h2>
		<p>Approval request from a workspace loop.</p>
	</article>
</DataState>
