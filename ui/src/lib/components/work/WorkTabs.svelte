<script lang="ts">
  import { page } from '$app/stores';
  import { Button } from '$lib/components/ui/button/index.js';
  import { cn } from '$lib/utils.js';

  const tabs = [
    { label: 'Live', href: '/work/live' },
    { label: 'Board', href: '/work' },
    { label: 'Activity', href: '/work/activity' },
    { label: 'Tasks', href: '/work/tasks' },
    { label: 'Loop Runs', href: '/work/loops/runs' },
    { label: 'Artifacts', href: '/work/artifacts' },
    { label: 'Reports', href: '/work/reports' },
  ];

  let { class: className }: { class?: string } = $props();

  function isActive(href: string): boolean {
    const path = $page.url.pathname;
    if (href === '/work') return path === href;
    return path === href || path.startsWith(`${href}/`);
  }
</script>

<nav class={cn('flex flex-wrap gap-2', className)} aria-label="Work tabs">
  {#each tabs as tab (tab.href)}
    <Button
      href={tab.href}
      variant={isActive(tab.href) ? 'secondary' : 'outline'}
      size="sm"
      aria-current={isActive(tab.href) ? 'page' : undefined}
    >
      {tab.label}
    </Button>
  {/each}
</nav>
