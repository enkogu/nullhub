<script lang="ts">
  let { status = "stopped" } = $props();

  const colors: Record<string, string> = {
    running: "var(--success)",
    stopped: "var(--text-muted)",
    starting: "var(--warning)",
    failed: "var(--error)",
    restarting: "var(--warning)",
    stopping: "var(--warning)",
  };
</script>

<span
  class="badge"
  class:running={status === "running"}
  style="--badge-color: {colors[status] || 'var(--text-muted)'}"
>
  {status}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    min-height: 1.5rem;
    padding: 0.125rem 0.5rem;
    border: 1px solid color-mix(in srgb, var(--badge-color) 18%, var(--shadcn-border));
    border-radius: calc(var(--shadcn-radius) - 2px);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0;
    line-height: 1;
    background: color-mix(in srgb, var(--badge-color) 8%, var(--shadcn-background));
    color: var(--badge-color);
    box-shadow: none;
    text-shadow: none;
    text-transform: none;
  }

  .badge::before {
    content: "";
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 9999px;
    background: var(--badge-color);
    box-shadow: none;
  }
</style>
