<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { builtinLoopTemplates, type LoopTemplate } from "$lib/loops/builtins";

  let {
    installedSlugs = new Set<string>(),
    installingSlug = "",
    oninstall,
  } = $props<{
    installedSlugs?: Set<string>;
    installingSlug?: string;
    oninstall: (template: LoopTemplate) => void;
  }>();

  const categories = [...new Set(builtinLoopTemplates.map((template) => template.category))];

  function templatesFor(category: string): LoopTemplate[] {
    return builtinLoopTemplates.filter((template) => template.category === category);
  }

  function isInstalled(template: LoopTemplate): boolean {
    return installedSlugs.has(template.slug);
  }
</script>

<div class="gallery">
  <div class="gallery-intro">
    <p>
      Built-in loop templates. Installing one creates a loop in the connected ticket store, ready to start.
    </p>
    <Button variant="outline" size="sm" href="/loops/marketplace">Browse Marketplace</Button>
  </div>

  {#each categories as category (category)}
    <section class="category">
      <h3>{category}</h3>
      <div class="template-grid">
        {#each templatesFor(category) as template (template.slug)}
          <Card class="template-card">
            <div class="template-head">
              <strong>{template.name}</strong>
              <Badge variant="muted">{template.machine}</Badge>
            </div>
            <p class="tagline">{template.tagline}</p>
            <dl class="template-facts">
              <div>
                <dt>Exit condition</dt>
                <dd>{template.exitCondition}</dd>
              </div>
              <div>
                <dt>Max iterations</dt>
                <dd>{template.maxIterations}</dd>
              </div>
            </dl>
            <div class="template-actions">
              {#if isInstalled(template)}
                <Badge variant="success">installed</Badge>
              {:else}
                <Button
                  size="sm"
                  onclick={() => oninstall(template)}
                  disabled={installingSlug === template.slug}
                >
                  {installingSlug === template.slug ? "Installing" : "Install"}
                </Button>
              {/if}
            </div>
          </Card>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .gallery {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .gallery-intro {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .gallery-intro p {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }

  .category {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .category h3 {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .template-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    gap: 0.75rem;
  }

  :global(.template-card) {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem;
  }

  .template-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .template-head strong {
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .tagline {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .template-facts {
    display: flex;
    margin: 0;
    flex-direction: column;
    gap: 0.35rem;
  }

  .template-facts div {
    display: flex;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }

  .template-facts dt {
    flex-shrink: 0;
    color: var(--shadcn-muted-foreground);
  }

  .template-facts dd {
    margin: 0;
  }

  .template-actions {
    display: flex;
    margin-top: auto;
    align-items: center;
    justify-content: flex-end;
  }
</style>
