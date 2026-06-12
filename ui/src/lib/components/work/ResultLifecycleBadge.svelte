<script lang="ts">
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { cn } from '$lib/utils.js';
  import { resultLifecycleMeta, type ResultLifecycle, type ResultLifecycleTone } from './results';

  let {
    lifecycle,
    class: className,
  }: {
    lifecycle: ResultLifecycle;
    class?: string;
  } = $props();

  let meta = $derived(resultLifecycleMeta[lifecycle]);

  function toneClass(tone: ResultLifecycleTone): string {
    if (tone === 'primary') return 'border-primary/20 bg-primary/10 text-primary';
    if (tone === 'ok') return 'border-ok/20 bg-ok/10 text-ok';
    if (tone === 'watch') return 'border-watch/20 bg-watch/10 text-watch';
    return 'border-border bg-muted text-muted-foreground';
  }
</script>

<Badge data-slot="result-lifecycle-badge" variant="outline" class={cn(toneClass(meta.tone), className)}>
  {meta.label}
</Badge>
