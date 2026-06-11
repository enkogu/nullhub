<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";

  let {
    title,
    subtitle,
    body,
    actionLabel = "",
    actionHref = "",
  } = $props<{
    title: string;
    subtitle: string;
    body: string;
    actionLabel?: string;
    actionHref?: string;
  }>();
</script>

<section class="work-tab-placeholder" aria-label={title}>
  <Card class="placeholder-card">
    <div class="placeholder-copy">
      <p class="placeholder-kicker">{subtitle}</p>
      <h2>{title}</h2>
      <p class="placeholder-body">{body}</p>
    </div>

    {#if actionLabel && actionHref}
      <div class="placeholder-actions">
        <Button href={actionHref} variant="outline" size="sm">{actionLabel}</Button>
      </div>
    {/if}
  </Card>
</section>

<style>
  .work-tab-placeholder {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .placeholder-card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1rem;
  }

  .placeholder-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.3rem;
  }

  .placeholder-kicker {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .placeholder-copy h2 {
    margin: 0;
    color: var(--shadcn-foreground);
    font-size: 1rem;
    font-weight: 600;
  }

  .placeholder-body {
    margin: 0;
    max-width: 50rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.92rem;
    line-height: 1.5;
  }

  .placeholder-actions {
    display: flex;
    justify-content: flex-start;
  }
</style>
