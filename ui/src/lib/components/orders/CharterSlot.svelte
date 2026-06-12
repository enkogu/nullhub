<script lang="ts">
  import FileTextIcon from '@lucide/svelte/icons/file-text';
  import GaugeIcon from '@lucide/svelte/icons/gauge';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Card } from '$lib/components/ui/card/index.js';
  import { cn } from '$lib/utils.js';

  let { class: className }: { class?: string } = $props();
</script>

<Card data-slot="orders-charter-slot" class={cn('gap-4 px-5', className)} aria-label="Charter slot">
  <div class="flex min-w-0 items-start justify-between gap-3">
    <div class="min-w-0 space-y-1">
      <h2 class="text-base font-semibold text-foreground">Charter</h2>
      <p class="text-sm leading-6 text-muted-foreground">Space mission, autonomy bounds, and default metrics.</p>
    </div>
    <Badge variant="outline">Stub</Badge>
  </div>

  <div class="grid gap-2 text-sm">
    <div class="flex items-center gap-2 rounded-md border px-3 py-2 text-muted-foreground">
      <FileTextIcon class="size-4 shrink-0" aria-hidden="true" />
      <span class="truncate">Mission not configured</span>
    </div>
    <div class="flex items-center gap-2 rounded-md border px-3 py-2 text-muted-foreground">
      <ShieldCheckIcon class="size-4 shrink-0" aria-hidden="true" />
      <span class="truncate">Autonomy bounds not configured</span>
    </div>
    <div class="flex items-center gap-2 rounded-md border px-3 py-2 text-muted-foreground">
      <GaugeIcon class="size-4 shrink-0" aria-hidden="true" />
      <span class="truncate">Default metrics not configured</span>
    </div>
  </div>
</Card>
