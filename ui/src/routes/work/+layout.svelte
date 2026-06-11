<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Tabs, TabsList, TabsTrigger } from "$lib/components/ui/tabs";

  let { children } = $props();

  const tabRoutes = [
    { id: "today", label: "Today", href: "/work/today" },
    { id: "live", label: "Live", href: "/work/live" },
    { id: "results", label: "Results", href: "/work/results" },
    { id: "activity", label: "Activity", href: "/work/activity" },
  ] as const;

  const activeTab = $derived(resolveActiveTab($page.url.pathname));

  function resolveActiveTab(pathname: string): string {
    if (pathname === "/work" || pathname === "/work/today") return "today";
    const tab = pathname.split("/")[2] || "today";
    return tabRoutes.some((route) => route.id === tab) ? tab : "today";
  }
</script>

<div class="work-shell">
  <PageHeader
    title="Work"
    subtitle="Today, live runs, results, activity, and evidence."
  />

  <Tabs value={activeTab} class="work-tabs-shell">
    <TabsList class="work-tabs">
      {#each tabRoutes as tab (tab.id)}
        <TabsTrigger
          value={tab.id}
          onclick={() => goto(tab.href)}
          class="work-tab"
        >
          {tab.label}
        </TabsTrigger>
      {/each}
    </TabsList>
  </Tabs>

  <section class="work-shell-body">
    {@render children()}
  </section>
</div>

<style>
  .work-shell {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .work-tabs-shell {
    gap: 0;
  }

  .work-tabs {
    gap: 0.25rem;
  }

  .work-tab {
    min-width: 0;
  }

  .work-shell-body {
    min-width: 0;
  }
</style>
