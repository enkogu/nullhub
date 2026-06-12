<script lang="ts">
  import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';
  import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
  import CheckCircleIcon from '@lucide/svelte/icons/check-circle';
  import FileTextIcon from '@lucide/svelte/icons/file-text';
  import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
  import SparklesIcon from '@lucide/svelte/icons/sparkles';
  import ZapIcon from '@lucide/svelte/icons/zap';
  import { untrack } from 'svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Card } from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Select } from '$lib/components/ui/select/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { cn } from '$lib/utils.js';
  import {
    autonomyTiers,
    cronHumanPreview,
    cronPresetIdForExpression,
    cronPresets,
    isOrderEditorDraftValid,
    normalizeOrderEditorDraft,
    orderBodySkeleton,
    orderActionOptions,
    orderActionTargetLabel,
    orderDraftToDocument,
    orderEditorTypeCards,
    validateOrderEditorDraft,
    type CronPresetId,
    type OrderActionType,
    type OrderAutonomyTier,
    type OrderEditorDraft,
    type OrderEditorType,
  } from './orders';

  let {
    draft,
    onSaveDraft,
    onApproveAndEnact,
    class: className,
  }: {
    draft?: Partial<OrderEditorDraft>;
    onSaveDraft?: (draft: OrderEditorDraft, document: string) => void;
    onApproveAndEnact?: (draft: OrderEditorDraft, document: string) => void;
    class?: string;
  } = $props();

  let form = $state<OrderEditorDraft>(untrack(() => normalizeOrderEditorDraft(draft)));
  let submitted = $state(false);
  let lastAction = $state('');

  let validation = $derived(validateOrderEditorDraft(form));
  let valid = $derived(isOrderEditorDraftValid(form));
  let documentPreview = $derived(orderDraftToDocument(form));
  let cronPreview = $derived(cronHumanPreview(form.schedule));
  let selectedTier = $derived(autonomyTiers.find((tier) => tier.tier === form.autonomyTier) ?? autonomyTiers[1]);
  let actionTargetLabel = $derived(orderActionTargetLabel(form.actionType));
  let showAiDecisionBar = $derived(form.source === 'ai_decision');
  let showMarkdownBody = $derived(form.type === 'schedule' || form.type === 'policy');
  let previewTitle = $derived(showMarkdownBody ? 'Document preview' : 'Dispatcher spec preview');
  let previewDescription = $derived(
    showMarkdownBody ? 'The draft remains a portable markdown order.' : 'The draft will be stored as dispatcher JSON content.',
  );

  const iconByType: Record<OrderEditorType, typeof CalendarClockIcon> = {
    schedule: CalendarClockIcon,
    policy: ShieldCheckIcon,
    trigger: ZapIcon,
    mandate: ScrollTextIcon,
  };

  function errorFor(key: keyof typeof validation): string {
    return submitted ? validation[key] ?? '' : '';
  }

  function selectType(type: OrderEditorType) {
    const card = orderEditorTypeCards.find((item) => item.type === type);
    if (card?.disabled) return;
    form.type = type;
    if (type === 'schedule' && !form.schedule) {
      const preset = cronPresets[0];
      form.schedule = preset.expression;
      form.cronPresetId = preset.id;
    }
    if (type === 'policy' && !form.policyAgentScope) {
      form.policyAgentScope = 'All agents in this Space';
    }
  }

  function selectPreset(event: Event) {
    const id = (event.currentTarget as HTMLSelectElement).value as CronPresetId;
    form.cronPresetId = id;
    const preset = cronPresets.find((item) => item.id === id);
    if (preset && preset.id !== 'raw') form.schedule = preset.expression;
  }

  function updateRawCron(event: Event) {
    form.schedule = (event.currentTarget as HTMLInputElement).value;
    form.cronPresetId = cronPresetIdForExpression(form.schedule);
  }

  function selectTier(tier: OrderAutonomyTier) {
    form.autonomyTier = tier;
  }

  function selectAction(event: Event) {
    form.actionType = (event.currentTarget as HTMLSelectElement).value as OrderActionType;
  }

  function updateMandateCadence(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    form.mandateCheckCadenceMs = value.trim() ? Number(value) : 0;
  }

  function useSkeleton() {
    form.body = orderBodySkeleton();
  }

  function snapshot(): OrderEditorDraft {
    return normalizeOrderEditorDraft({ ...form });
  }

  function saveDraft() {
    submitted = true;
    lastAction = '';
    if (!valid) return;
    const current = snapshot();
    const document = orderDraftToDocument(current);
    onSaveDraft?.(current, document);
    lastAction = 'Draft passed validation.';
  }

  function approveAndEnact() {
    submitted = true;
    lastAction = '';
    if (!valid) return;
    const current = snapshot();
    const document = orderDraftToDocument(current);
    onApproveAndEnact?.(current, document);
    lastAction = 'AI decision draft approved.';
  }
</script>

<section
  data-slot="order-editor"
  class={cn('flex min-w-0 flex-col gap-4', className)}
  aria-label="Order editor"
>
  {#if showAiDecisionBar}
    <div
      data-slot="order-editor-ai-decision-bar"
      class="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950 md:flex-row md:items-center md:justify-between"
    >
      <div class="flex min-w-0 items-start gap-2">
        <SparklesIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div class="min-w-0">
          <p class="text-sm font-medium">AI decision draft</p>
          <p class="text-sm leading-6 text-amber-900">
            Review the proposed order before it can become active.
          </p>
        </div>
      </div>
      <Button size="sm" onclick={approveAndEnact} disabled={!valid}>Approve &amp; enact</Button>
    </div>
  {/if}

  <div class="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <div class="flex min-w-0 flex-col gap-4">
      <Card class="gap-4 rounded-lg px-5">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm font-semibold">Type</h2>
            <Badge variant="secondary">4 types</Badge>
          </div>
          <p class="text-sm leading-6 text-muted-foreground">Choose the durable order shape for this draft.</p>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          {#each orderEditorTypeCards as card (card.type)}
            {@const TypeIcon = iconByType[card.type]}
            <button
              type="button"
              data-order-type-card={card.type}
              class={cn(
                'min-h-32 rounded-lg border p-4 text-left transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                form.type === card.type && !card.disabled
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'bg-card hover:bg-accent/40',
                card.disabled && 'cursor-not-allowed border-dashed bg-muted/40 text-muted-foreground opacity-70 hover:bg-muted/40',
              )}
              disabled={card.disabled}
              aria-pressed={form.type === card.type}
              onclick={() => selectType(card.type)}
            >
              <span class="flex items-start justify-between gap-3">
                <span class="inline-flex items-center gap-2 text-sm font-semibold">
                  <TypeIcon class="size-4" aria-hidden="true" />
                  {card.label}
                </span>
                {#if card.disabledLabel}
                  <Badge variant="muted">{card.disabledLabel}</Badge>
                {/if}
              </span>
              <span class="mt-3 block text-sm leading-6">{card.description}</span>
              {#if card.disabled}
                <span class="mt-3 block text-xs font-medium">Greyed until P5</span>
              {/if}
            </button>
          {/each}
        </div>
        {#if errorFor('type')}
          <p class="text-sm text-destructive">{errorFor('type')}</p>
        {/if}
      </Card>

      <Card class="gap-4 rounded-lg px-5">
        <div class="space-y-1">
          <h2 class="text-sm font-semibold">Basics</h2>
          <p class="text-sm leading-6 text-muted-foreground">Name the order and summarize the standing instruction.</p>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <Label for="order-editor-title">Title</Label>
            <Input
              id="order-editor-title"
              bind:value={form.title}
              placeholder="Morning operations brief"
              aria-invalid={Boolean(errorFor('title'))}
            />
            {#if errorFor('title')}
              <p class="text-sm text-destructive">{errorFor('title')}</p>
            {/if}
          </div>
          <div class="space-y-2">
            <Label for="order-editor-summary">Summary</Label>
            <Input id="order-editor-summary" bind:value={form.summary} placeholder="Daily customer and work summary" />
          </div>
        </div>
      </Card>

      {#if form.type === 'schedule'}
        <Card class="gap-4 rounded-lg px-5">
          <div class="space-y-1">
            <h2 class="text-sm font-semibold">Schedule</h2>
            <p class="text-sm leading-6 text-muted-foreground">Pick a preset or write a raw cron expression.</p>
          </div>

          <div class="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <div class="space-y-2">
              <Label for="order-editor-cron-preset">Cron preset</Label>
              <Select id="order-editor-cron-preset" value={form.cronPresetId} onchange={selectPreset}>
                {#each cronPresets as preset (preset.id)}
                  <option value={preset.id}>{preset.label}</option>
                {/each}
              </Select>
            </div>
            <div class="space-y-2">
              <Label for="order-editor-cron">Raw cron</Label>
              <Input
                id="order-editor-cron"
                value={form.schedule}
                placeholder="0 9 * * 1-5"
                aria-invalid={Boolean(errorFor('schedule'))}
                oninput={updateRawCron}
              />
              {#if errorFor('schedule')}
                <p class="text-sm text-destructive">{errorFor('schedule')}</p>
              {/if}
            </div>
          </div>

          <div class="rounded-md border bg-muted/40 p-3 text-sm">
            <span class="font-medium">Preview:</span>
            <span class="text-muted-foreground">{cronPreview}</span>
          </div>
        </Card>
      {:else if form.type === 'policy'}
        <Card class="gap-4 rounded-lg px-5">
          <div class="space-y-1">
            <h2 class="text-sm font-semibold">Policy</h2>
            <p class="text-sm leading-6 text-muted-foreground">Scope where this agent policy applies.</p>
          </div>

          <div class="space-y-2">
            <Label for="order-editor-agent-scope">Agent scope</Label>
            <Input
              id="order-editor-agent-scope"
              bind:value={form.policyAgentScope}
              placeholder="All agents in this Space"
              aria-invalid={Boolean(errorFor('policyAgentScope'))}
            />
            {#if errorFor('policyAgentScope')}
              <p class="text-sm text-destructive">{errorFor('policyAgentScope')}</p>
            {/if}
          </div>
        </Card>
      {:else if form.type === 'trigger'}
        <Card class="gap-4 rounded-lg px-5">
          <div class="space-y-1">
            <h2 class="text-sm font-semibold">Trigger</h2>
            <p class="text-sm leading-6 text-muted-foreground">Match an event-log signal and choose the dispatcher action.</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <Label for="order-editor-trigger-event-type">Event type</Label>
              <Input
                id="order-editor-trigger-event-type"
                bind:value={form.triggerEventType}
                placeholder="work.ticket.created"
                aria-invalid={Boolean(errorFor('triggerEventType'))}
              />
              {#if errorFor('triggerEventType')}
                <p class="text-sm text-destructive">{errorFor('triggerEventType')}</p>
              {/if}
            </div>
            <div class="space-y-2">
              <Label for="order-editor-trigger-source">Source filter</Label>
              <Input id="order-editor-trigger-source" bind:value={form.triggerSource} placeholder="nulltickets" />
            </div>
            <div class="space-y-2">
              <Label for="order-editor-trigger-subject-type">Subject type</Label>
              <Input id="order-editor-trigger-subject-type" bind:value={form.triggerSubjectType} placeholder="ticket" />
            </div>
            <div class="space-y-2">
              <Label for="order-editor-trigger-subject-id">Subject id</Label>
              <Input id="order-editor-trigger-subject-id" bind:value={form.triggerSubjectId} placeholder="optional-id" />
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <div class="space-y-2">
              <Label for="order-editor-trigger-action">Action</Label>
              <Select id="order-editor-trigger-action" value={form.actionType} onchange={selectAction}>
                {#each orderActionOptions as action (action.value)}
                  <option value={action.value}>{action.label}</option>
                {/each}
              </Select>
            </div>
            <div class="space-y-2">
              <Label for="order-editor-trigger-target">{actionTargetLabel}</Label>
              <Input id="order-editor-trigger-target" bind:value={form.actionTarget} placeholder="default" />
            </div>
          </div>

          <div class="space-y-2">
            <Label for="order-editor-trigger-instructions">Instructions</Label>
            <Textarea
              id="order-editor-trigger-instructions"
              bind:value={form.actionInstructions}
              class="min-h-28"
              placeholder="What the dispatcher should ask the selected action to do."
            />
          </div>
        </Card>
      {:else if form.type === 'mandate'}
        <Card class="gap-4 rounded-lg px-5">
          <div class="space-y-1">
            <h2 class="text-sm font-semibold">Mandate</h2>
            <p class="text-sm leading-6 text-muted-foreground">Define the goal, completion condition, and check cadence.</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2 md:col-span-2">
              <Label for="order-editor-mandate-goal">Goal</Label>
              <Input
                id="order-editor-mandate-goal"
                bind:value={form.mandateGoal}
                placeholder="subscribers-50"
                aria-invalid={Boolean(errorFor('mandateGoal'))}
              />
              {#if errorFor('mandateGoal')}
                <p class="text-sm text-destructive">{errorFor('mandateGoal')}</p>
              {/if}
            </div>
            <div class="space-y-2">
              <Label for="order-editor-mandate-condition-event">Condition event type</Label>
              <Input
                id="order-editor-mandate-condition-event"
                bind:value={form.mandateConditionEventType}
                placeholder="subscribers.goal_met"
                aria-invalid={Boolean(errorFor('mandateConditionEventType'))}
              />
              {#if errorFor('mandateConditionEventType')}
                <p class="text-sm text-destructive">{errorFor('mandateConditionEventType')}</p>
              {/if}
            </div>
            <div class="space-y-2">
              <Label for="order-editor-mandate-unmet-event">Unmet event type</Label>
              <Input
                id="order-editor-mandate-unmet-event"
                bind:value={form.mandateUnmetEventType}
                placeholder="subscribers.goal_unmet"
              />
            </div>
            <div class="space-y-2">
              <Label for="order-editor-mandate-cadence">Check cadence ms</Label>
              <Input
                id="order-editor-mandate-cadence"
                type="number"
                min="1"
                step="1000"
                value={form.mandateCheckCadenceMs}
                aria-invalid={Boolean(errorFor('mandateCheckCadenceMs'))}
                oninput={updateMandateCadence}
              />
              {#if errorFor('mandateCheckCadenceMs')}
                <p class="text-sm text-destructive">{errorFor('mandateCheckCadenceMs')}</p>
              {/if}
            </div>
            <div class="space-y-2">
              <Label for="order-editor-mandate-source">Condition source filter</Label>
              <Input id="order-editor-mandate-source" bind:value={form.mandateConditionSource} placeholder="nullhub" />
            </div>
            <div class="space-y-2">
              <Label for="order-editor-mandate-subject-type">Condition subject type</Label>
              <Input id="order-editor-mandate-subject-type" bind:value={form.mandateConditionSubjectType} placeholder="goal" />
            </div>
            <div class="space-y-2">
              <Label for="order-editor-mandate-subject-id">Condition subject id</Label>
              <Input id="order-editor-mandate-subject-id" bind:value={form.mandateConditionSubjectId} placeholder="optional-id" />
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <div class="space-y-2">
              <Label for="order-editor-mandate-action">Action</Label>
              <Select id="order-editor-mandate-action" value={form.actionType} onchange={selectAction}>
                {#each orderActionOptions as action (action.value)}
                  <option value={action.value}>{action.label}</option>
                {/each}
              </Select>
            </div>
            <div class="space-y-2">
              <Label for="order-editor-mandate-target">{actionTargetLabel}</Label>
              <Input id="order-editor-mandate-target" bind:value={form.actionTarget} placeholder="default" />
            </div>
          </div>

          <div class="space-y-2">
            <Label for="order-editor-mandate-instructions">Instructions</Label>
            <Textarea
              id="order-editor-mandate-instructions"
              bind:value={form.actionInstructions}
              class="min-h-28"
              placeholder="How the dispatcher should continue work while the condition is unmet."
            />
          </div>
        </Card>
      {/if}

      <Card class="gap-4 rounded-lg px-5">
        <div class="space-y-1">
          <h2 class="text-sm font-semibold">Autonomy tier</h2>
          <p class="text-sm leading-6 text-muted-foreground">Set how much the agent can do before asking.</p>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          {#each autonomyTiers as tier (tier.tier)}
            <button
              type="button"
              class={cn(
                'rounded-lg border p-3 text-left transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                form.autonomyTier === tier.tier ? 'border-primary bg-primary/5' : 'bg-card hover:bg-accent/40',
              )}
              aria-pressed={form.autonomyTier === tier.tier}
              onclick={() => selectTier(tier.tier)}
            >
              <span class="block text-sm font-semibold">{tier.label}</span>
              <span class="mt-1 block text-sm leading-6 text-muted-foreground">{tier.description}</span>
            </button>
          {/each}
        </div>

        <div class="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <AlertTriangleIcon class="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p class="leading-6">
            <span class="font-medium">{selectedTier.tier} warning:</span>
            <span class="text-muted-foreground">{selectedTier.warning}</span>
          </p>
        </div>
      </Card>

      {#if showMarkdownBody}
        <Card class="gap-4 rounded-lg px-5">
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div class="space-y-1">
              <h2 class="text-sm font-semibold">Body</h2>
              <p class="text-sm leading-6 text-muted-foreground">Keep the order readable as a markdown document.</p>
            </div>
            <Button variant="outline" size="sm" onclick={useSkeleton}>Use WHEN/WHAT/BOUNDS skeleton</Button>
          </div>

          <div class="space-y-2">
            <Label for="order-editor-body">Markdown body</Label>
            <Textarea
              id="order-editor-body"
              bind:value={form.body}
              class="min-h-64 font-mono"
              aria-invalid={Boolean(errorFor('body'))}
            />
            {#if errorFor('body')}
              <p class="text-sm text-destructive">{errorFor('body')}</p>
            {/if}
          </div>
        </Card>
      {/if}
    </div>

    <aside class="flex min-w-0 flex-col gap-4">
      <Card class="gap-4 rounded-lg px-5">
        <div class="space-y-1">
          <h2 class="text-sm font-semibold">{previewTitle}</h2>
          <p class="text-sm leading-6 text-muted-foreground">{previewDescription}</p>
        </div>

        <pre class="max-h-[32rem] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-5 whitespace-pre-wrap">{documentPreview}</pre>
      </Card>

      <Card class="gap-4 rounded-lg px-5">
        <div class="space-y-1">
          <h2 class="text-sm font-semibold">Actions</h2>
          <p class="text-sm leading-6 text-muted-foreground">Validate the draft before it moves forward.</p>
        </div>

        <div class="flex flex-col gap-2">
          <Button onclick={saveDraft}>Save draft</Button>
          {#if showAiDecisionBar}
            <Button variant="secondary" onclick={approveAndEnact} disabled={!valid}>Approve &amp; enact</Button>
          {/if}
        </div>

        {#if !valid && submitted}
          <div class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangleIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>Resolve the highlighted fields before this draft can be used.</p>
          </div>
        {/if}

        {#if lastAction}
          <div class="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircleIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{lastAction}</p>
          </div>
        {/if}
      </Card>

      <Card class="gap-3 rounded-lg px-5">
        <div class="flex items-start gap-2">
          <FileTextIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div class="min-w-0 space-y-1">
            <h2 class="text-sm font-semibold">{showMarkdownBody ? 'Portable document' : 'Dispatcher content'}</h2>
            <p class="text-sm leading-6 text-muted-foreground">
              {showMarkdownBody
                ? 'The order can be reviewed as frontmatter plus a markdown body.'
                : 'The order content follows the backend trigger and mandate spec.'}
            </p>
          </div>
        </div>
      </Card>
    </aside>
  </div>
</section>
