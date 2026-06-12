<script lang="ts">
  import ArchiveIcon from '@lucide/svelte/icons/archive';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import EditIcon from '@lucide/svelte/icons/pencil';
  import PauseIcon from '@lucide/svelte/icons/pause';
  import PlayIcon from '@lucide/svelte/icons/play';
  import type { NullHubEvent, Order } from '$lib/api/client';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import DataState, { type DataStateKind } from '$lib/components/DataState.svelte';
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte';
  import StatusDot from '$lib/components/StatusDot.svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { cn } from '$lib/utils.js';
  import {
    availableOrderActions,
    extractOrderFrontmatter,
    orderActionCopy,
    orderDetailIsSupported,
    orderEventLabel,
    orderEventRunId,
    orderEventVariant,
    orderHistoryEvents,
    orderRunHref,
    orderSystemFacts,
    type OrderDetailAction,
    type OrderDetailState,
  } from './orderDetail';
  import {
    formatOrderTime,
    orderKindLabel,
    orderStatusDot,
    orderStatusLabel,
    orderStatusVariant,
    orderTypeVariant,
  } from './orders';

  let {
    order = null,
    events = [],
    state: viewState = 'loading',
    error,
    actionError,
    nowMs = Date.now(),
    spaceId = null,
    editHref,
    onRetry,
    onSuspend,
    onResume,
    onArchive,
    class: className,
  }: {
    order?: Order | null;
    events?: NullHubEvent[];
    state?: OrderDetailState;
    error?: unknown;
    actionError?: unknown;
    nowMs?: number;
    spaceId?: string | null;
    editHref?: string;
    onRetry?: () => void;
    onSuspend?: () => void | Promise<void>;
    onResume?: () => void | Promise<void>;
    onArchive?: () => void | Promise<void>;
    class?: string;
  } = $props();

  let confirmOpen = $state(false);
  let confirmAction = $state<OrderDetailAction | null>(null);
  let localActionError = $state<unknown>(null);
  let pendingAction = $state<OrderDetailAction | null>(null);

  let dataState = $derived<DataStateKind>(
    viewState === 'loading' ? 'loading' : viewState === 'error' ? 'error' : order ? 'populated' : 'empty',
  );
  let frontmatterFacts = $derived(order ? extractOrderFrontmatter(order.content) : []);
  let systemFacts = $derived(order ? orderSystemFacts(order, nowMs) : []);
  let historyEvents = $derived(orderHistoryEvents(events));
  let supportedDetail = $derived(order ? orderDetailIsSupported(order) : false);
  let actions = $derived(availableOrderActions(order));
  let currentActionCopy = $derived(confirmAction && order ? orderActionCopy(confirmAction, order) : null);
  let visibleActionError = $derived(localActionError || actionError);

  function openConfirm(action: OrderDetailAction) {
    confirmAction = action;
    localActionError = null;
    confirmOpen = true;
  }

  async function confirmSelectedAction() {
    if (!confirmAction) return;
    pendingAction = confirmAction;
    localActionError = null;
    try {
      if (confirmAction === 'suspend') await onSuspend?.();
      if (confirmAction === 'resume') await onResume?.();
      if (confirmAction === 'archive') await onArchive?.();
      confirmOpen = false;
    } catch (error) {
      localActionError = error;
    } finally {
      pendingAction = null;
    }
  }

  function errorMessage(value: unknown): string {
    if (!value) return '';
    if (value instanceof Error) return value.message;
    return String(value);
  }

  function actionIcon(action: OrderDetailAction) {
    if (action === 'suspend') return PauseIcon;
    if (action === 'resume') return PlayIcon;
    return ArchiveIcon;
  }

  $effect(() => {
    if (!confirmOpen) {
      confirmAction = null;
      localActionError = null;
    }
  });
</script>

<section
  data-slot="order-doc-view"
  class={cn('flex min-w-0 flex-col gap-5', className)}
  aria-label="Order detail"
>
  <DataState
    state={dataState}
    {error}
    loadingTitle="Loading order"
    loadingDescription="Fetching the order document and execution history."
    emptyTitle="Order not found"
    emptyDescription="The selected Space does not have a matching order."
    emptyIcon="inbox"
    errorTitle="Order unavailable"
    errorFallback="The order detail could not load."
    retryLabel={onRetry ? 'Retry' : undefined}
    {onRetry}
  >
    {#if order}
      <div class="flex min-w-0 flex-col gap-5">
        <header class="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <div class="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0 space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <StatusDot status={orderStatusDot(order.status)} label={orderStatusLabel(order.status)} size="sm" />
                <Badge variant={orderTypeVariant(order.kind)}>{orderKindLabel(order.kind)}</Badge>
                <Badge variant={orderStatusVariant(order.status)}>{orderStatusLabel(order.status)}</Badge>
                {#if !supportedDetail}
                  <Badge variant="muted">Deferred</Badge>
                {/if}
              </div>
              <div class="min-w-0">
                <h2 class="text-xl font-semibold leading-7">{order.title || order.id}</h2>
                <p class="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {order.summary || 'No summary captured for this order.'}
                </p>
              </div>
            </div>

            <div class="flex shrink-0 flex-wrap items-center gap-2">
              <Button href={editHref} variant="outline" size="sm" disabled={!supportedDetail || !editHref}>
                <EditIcon aria-hidden="true" />
                Edit
              </Button>
              {#each actions as action}
                {@const copy = orderActionCopy(action, order)}
                {@const Icon = actionIcon(action)}
                <Button
                  variant={copy.destructive ? 'destructive' : 'outline'}
                  size="sm"
                  onclick={() => openConfirm(action)}
                  disabled={pendingAction !== null}
                >
                  <Icon aria-hidden="true" />
                  {copy.label}
                </Button>
              {/each}
            </div>
          </div>
        </header>

        {#if visibleActionError}
          <div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {errorMessage(visibleActionError)}
          </div>
        {/if}

        {#if !supportedDetail}
          <section class="rounded-lg border bg-muted/40 p-5 text-muted-foreground" aria-label="Deferred order detail">
            <h3 class="text-sm font-semibold text-foreground">Detail view deferred</h3>
            <p class="mt-2 text-sm leading-6">
              {orderKindLabel(order.kind)} order document rendering is deferred until this order type is enabled.
            </p>
          </section>
        {:else}
          <div class="grid min-w-0 gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
            <aside class="flex min-w-0 flex-col gap-4" aria-label="Order facts">
              <section class="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
                <h3 class="text-sm font-semibold">Frontmatter</h3>
                {#if frontmatterFacts.length > 0}
                  <dl class="mt-3 grid gap-3 text-sm">
                    {#each frontmatterFacts as fact}
                      <div class="min-w-0">
                        <dt class="text-xs font-medium uppercase text-muted-foreground">{fact.label}</dt>
                        <dd class="mt-1 break-words text-foreground">{fact.value}</dd>
                      </div>
                    {/each}
                  </dl>
                {:else}
                  <p class="mt-3 text-sm leading-6 text-muted-foreground">No YAML frontmatter in this order document.</p>
                {/if}
              </section>

              <section class="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
                <h3 class="text-sm font-semibold">Facts</h3>
                <dl class="mt-3 grid gap-3 text-sm">
                  {#each systemFacts as fact}
                    <div class="min-w-0">
                      <dt class="text-xs font-medium uppercase text-muted-foreground">{fact.label}</dt>
                      <dd class="mt-1 break-words text-foreground">{fact.value}</dd>
                    </div>
                  {/each}
                </dl>
              </section>
            </aside>

            <div class="flex min-w-0 flex-col gap-5">
              <MarkdownViewer
                markdown={order.content}
                state={order.content.trim() ? 'populated' : 'empty'}
                emptyTitle="No order document"
                emptyDescription="This order does not have managed Markdown content yet."
                ariaLabel="Order Markdown"
              />

              <section class="rounded-lg border bg-card p-4 text-card-foreground shadow-sm" aria-label="Execution history">
                <div class="flex items-center justify-between gap-3">
                  <h3 class="text-sm font-semibold">Execution history</h3>
                  <Badge variant="muted">{historyEvents.length} events</Badge>
                </div>
                {#if historyEvents.length > 0}
                  <ol class="mt-4 divide-y">
                    {#each historyEvents as event (event.id)}
                      {@const runId = orderEventRunId(event)}
                      <li class="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0">
                        <div class="flex min-w-0 flex-wrap items-center gap-2">
                          <Badge variant={orderEventVariant(event)}>{event.type}</Badge>
                          <span class="min-w-0 flex-1 truncate text-sm font-medium">{orderEventLabel(event)}</span>
                          <time
                            class="inline-flex items-center gap-1 text-xs text-muted-foreground"
                            datetime={event.createdAtMs ? new Date(event.createdAtMs).toISOString() : undefined}
                          >
                            <ClockIcon class="size-3.5" aria-hidden="true" />
                            {formatOrderTime(event.createdAtMs, nowMs)}
                          </time>
                        </div>
                        {#if event.summary}
                          <p class="text-sm leading-6 text-muted-foreground">{event.summary}</p>
                        {/if}
                        {#if runId}
                          <a
                            class="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                            href={orderRunHref(runId, spaceId)}
                          >
                            Open run {runId}
                          </a>
                        {/if}
                      </li>
                    {/each}
                  </ol>
                {:else}
                  <p class="mt-3 text-sm leading-6 text-muted-foreground">
                    No order execution events have been recorded for this Space.
                  </p>
                {/if}
              </section>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </DataState>
</section>

{#if currentActionCopy}
  <ConfirmDialog
    bind:open={confirmOpen}
    title={currentActionCopy.title}
    description={currentActionCopy.description}
    confirmLabel={currentActionCopy.confirmLabel}
    destructive={currentActionCopy.destructive}
    loading={pendingAction === currentActionCopy.action}
    closeOnConfirm={false}
    onConfirm={confirmSelectedAction}
  >
    {#if localActionError}
      <p class="text-sm leading-6 text-destructive">{errorMessage(localActionError)}</p>
    {:else}
      <p class="text-sm leading-6 text-muted-foreground">
        The order detail will refresh after this action completes.
      </p>
    {/if}
  </ConfirmDialog>
{/if}
