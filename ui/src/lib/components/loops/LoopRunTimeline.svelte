<script lang="ts">
  import Timeline, { type TimelineItem, type TimelineState } from "$lib/components/Timeline.svelte";
  import type { LoopRunEvent } from "$lib/loops/types";
  import { eventDetail, eventLabel } from "./loopRunDetail";

  let {
    events = [],
    state,
  }: {
    events?: LoopRunEvent[];
    state?: TimelineState;
  } = $props();

  function statusFor(event: LoopRunEvent): TimelineItem["status"] {
    const kind = event.kind.toLowerCase();
    if (kind.includes("fail") || kind.includes("dead") || kind.includes("error")) return "error";
    if (kind.includes("blocked") || kind.includes("retry") || kind.includes("warning")) return "warning";
    if (kind.includes("started") || kind.includes("claimed")) return "current";
    return "complete";
  }

  let items = $derived<TimelineItem[]>(
    events.map((event) => ({
      id: String(event.id),
      title: eventLabel(event),
      description: eventDetail(event) || undefined,
      timestamp: event.ts_ms,
      status: statusFor(event),
      meta: event.kind,
    })),
  );
</script>

<Timeline
  title="Timeline"
  {items}
  {state}
  emptyTitle="No events recorded"
  emptyDescription="Run lifecycle events will appear here once the worker reports progress."
  errorTitle="Timeline unavailable"
  errorMessage="Run events could not be loaded."
/>
