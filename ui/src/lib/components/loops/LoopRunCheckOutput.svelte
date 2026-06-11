<script lang="ts">
  import CodeBlock from "$lib/components/CodeBlock.svelte";
  import {
    extractCheckOutput,
    type LoopAgentResult,
    type LoopRunDetailData,
    type LoopRunDetailEntry,
  } from "./loopRunDetail";

  let {
    detail = { events: [], artifacts: [] },
    entry = null,
    agentResult = null,
    loading = false,
    error = "",
  }: {
    detail?: LoopRunDetailData;
    entry?: LoopRunDetailEntry | null;
    agentResult?: LoopAgentResult | null;
    loading?: boolean;
    error?: string;
  } = $props();

  let output = $derived(extractCheckOutput(detail, entry, agentResult));
</script>

<CodeBlock
  title={output?.source || "Check output"}
  language={output?.language || "text"}
  code={output?.content || ""}
  ariaLabel="Check output"
  state={output ? "populated" : loading ? "loading" : error ? "error" : "empty"}
  errorTitle="Check output unavailable"
  errorMessage={error || "The check output could not be loaded."}
  emptyTitle="No check output"
  emptyDescription="No event or artifact in this run contains check output yet."
  wrap
/>
