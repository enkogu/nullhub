<script lang="ts">
  import ActivityIcon from '@lucide/svelte/icons/activity';
  import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import LayersIcon from '@lucide/svelte/icons/layers';
  import RadioIcon from '@lucide/svelte/icons/radio';
  import StatusDot from '$lib/components/StatusDot.svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { cn } from '$lib/utils.js';
  import type { OrderRegistryItem } from './orders';

  let {
    item,
    class: className,
  }: {
    item: OrderRegistryItem;
    class?: string;
  } = $props();

  let absoluteTime = $derived(item.updatedAtMs ? new Date(item.updatedAtMs).toISOString() : undefined);
</script>

<article
  data-slot="order-row"
  class={cn('rounded-lg border bg-card p-4 text-card-foreground shadow-sm', className)}
  aria-label={`${item.title} ${item.kindLabel} order`}
>
  <div class="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
    <div class="min-w-0 space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <StatusDot status={item.statusDot} label={item.statusLabel} size="sm" />
        <Badge variant={item.typeVariant}>{item.kindLabel}</Badge>
        <Badge variant={item.statusVariant}>{item.statusLabel}</Badge>
      </div>
      <div class="min-w-0">
        <h3 class="truncate text-sm font-semibold">{item.title}</h3>
        <p class="mt-1 text-sm leading-6 text-muted-foreground">{item.summary}</p>
      </div>
    </div>

    <div class="grid shrink-0 grid-cols-2 gap-2 text-xs sm:min-w-56">
      <span class="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-muted-foreground">
        <LayersIcon class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">Tier {item.tierLabel}</span>
      </span>
      <span class="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-muted-foreground">
        <ActivityIcon class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{item.execLabel}</span>
      </span>
    </div>
  </div>

  <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    <span class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1">
      <CalendarClockIcon class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">{item.scheduleLabel}</span>
    </span>
    <span class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1">
      <RadioIcon class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">{item.signalLabel}</span>
    </span>
    <time class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1" datetime={absoluteTime}>
      <ClockIcon class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">Updated {item.updatedLabel}</span>
    </time>
  </div>
</article>
