<script lang="ts">
  import ActivityIcon from '@lucide/svelte/icons/activity';
  import BotIcon from '@lucide/svelte/icons/bot';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import { Badge, type BadgeVariant } from '$lib/components/ui/badge/index.js';
  import StatusDot, { type StatusDotStatus } from '$lib/components/StatusDot.svelte';
  import { cn } from '$lib/utils.js';
  import type { NullHubEvent } from '$lib/api/client';
  import { activityLabel, eventAgent, eventLevel, formatActivityTime } from './activity';

  let {
    event,
    nowMs = Date.now(),
    class: className,
  }: {
    event: NullHubEvent;
    nowMs?: number;
    class?: string;
  } = $props();

  let level = $derived(eventLevel(event));
  let levelLabel = $derived(activityLabel(level, 'Info'));
  let sourceLabel = $derived(activityLabel(event.source, 'Unknown source'));
  let agent = $derived(eventAgent(event));
  let title = $derived(event.title || activityLabel(event.type, 'Activity event'));
  let summary = $derived(event.summary || event.type);
  let subjectLabel = $derived(
    [activityLabel(event.subjectType, ''), event.subjectId].filter(Boolean).join(' ') || 'No subject',
  );
  let eventTime = $derived(formatActivityTime(event.createdAtMs, nowMs));
  let absoluteTime = $derived(event.createdAtMs ? new Date(event.createdAtMs).toISOString() : undefined);

  function levelStatus(value: string): StatusDotStatus {
    if (value === 'success') return 'ok';
    if (value === 'warning') return 'watch';
    if (value === 'error') return 'failed';
    if (value === 'debug') return 'muted';
    return 'running';
  }

  function levelVariant(value: string): BadgeVariant {
    if (value === 'success') return 'success';
    if (value === 'warning') return 'warning';
    if (value === 'error') return 'destructive';
    if (value === 'debug') return 'muted';
    return 'secondary';
  }
</script>

<article
  data-slot="event-row"
  class={cn('rounded-lg border bg-card p-4 text-card-foreground shadow-sm', className)}
  aria-label={`${title} from ${sourceLabel}`}
>
  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
    <div class="min-w-0 space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <StatusDot status={levelStatus(level)} label={levelLabel} size="sm" />
        <Badge variant="outline">{sourceLabel}</Badge>
        <Badge variant={levelVariant(level)}>{levelLabel}</Badge>
      </div>
      <div class="min-w-0">
        <h3 class="truncate text-sm font-semibold">{title}</h3>
        <p class="mt-1 text-sm leading-6 text-muted-foreground">{summary}</p>
      </div>
    </div>
    <time class="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" datetime={absoluteTime}>
      <ClockIcon class="size-3.5" aria-hidden="true" />
      {eventTime}
    </time>
  </div>

  <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    <span class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1">
      <ActivityIcon class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">{event.type}</span>
    </span>
    <span class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1">
      <ActivityIcon class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">{subjectLabel}</span>
    </span>
    {#if agent}
      <span class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1">
        <BotIcon class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{activityLabel(agent)}</span>
      </span>
    {/if}
  </div>
</article>
