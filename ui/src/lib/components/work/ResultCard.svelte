<script lang="ts">
  import ClockIcon from '@lucide/svelte/icons/clock';
  import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Card } from '$lib/components/ui/card/index.js';
  import { cn } from '$lib/utils.js';
  import { formatLiveTime } from './live';
  import ResultLifecycleBadge from './ResultLifecycleBadge.svelte';
  import { appResultHref, resultSourceLabel, resultTypeLabel, type WorkResult } from './results';

  let {
    result,
    spaceId = '',
    nowMs = Date.now(),
    class: className,
  }: {
    result: WorkResult;
    spaceId?: string;
    nowMs?: number;
    class?: string;
  } = $props();

  let producedLabel = $derived(formatLiveTime(result.producedAtMs, nowMs));
  let absoluteTime = $derived(result.producedAtMs ? new Date(result.producedAtMs).toISOString() : undefined);
  let appHref = $derived(result.type === 'app' ? appResultHref(result, spaceId) : undefined);
</script>

<Card data-slot="result-card" class={cn('gap-3 px-5', className)} role="article" aria-label={`${result.title} ${resultSourceLabel(result.source)}`}>
  <div class="flex flex-wrap items-center gap-2">
    <ResultLifecycleBadge lifecycle={result.lifecycle} />
    <Badge variant="outline">{resultSourceLabel(result.source)}</Badge>
    <Badge variant="muted">{resultTypeLabel(result.type)}</Badge>
  </div>

  <div class="min-w-0">
    <h3 class="truncate text-sm font-semibold">{result.title}</h3>
    <p class="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{result.summary}</p>
  </div>

  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <time class="inline-flex items-center gap-1.5" datetime={absoluteTime}>
        <ClockIcon class="size-3.5" aria-hidden="true" />
        {producedLabel}
      </time>
      {#if result.evidenceRef}
        <span class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1">
          <span class="truncate">{result.evidenceRef}</span>
        </span>
      {/if}
    </div>
    {#if appHref}
      <Button href={appHref} variant="outline" size="sm" aria-label={`Open app ${result.title}`}>
        <ExternalLinkIcon class="size-4" aria-hidden="true" />
        Open app
      </Button>
    {:else if result.href}
      <Button href={result.href} variant="outline" size="sm" aria-label={`Open ${result.title}`}>
        <ExternalLinkIcon class="size-4" aria-hidden="true" />
        Open
      </Button>
    {/if}
  </div>
</Card>
