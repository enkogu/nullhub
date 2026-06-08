<script lang="ts">
  import { channelSchemas, staticSections, type FieldDef } from './configSchemas';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Select } from '$lib/components/ui/select';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import XIcon from '@lucide/svelte/icons/x';

  let { config = $bindable({}), onchange = () => {} }: {
    config: any;
    onchange: () => void;
  } = $props();

  let openSections = $state<Record<string, boolean>>({});
  let addChannelOpen = $state(false);

  function toggle(key: string) {
    openSections[key] = !openSections[key];
  }

  function getPath(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  function setPath(obj: any, path: string, value: any): any {
    const clone = JSON.parse(JSON.stringify(obj));
    const keys = path.split('.');
    let cur = clone;
    for (let i = 0; i < keys.length - 1; i++) {
      if (cur[keys[i]] === undefined || cur[keys[i]] === null) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
    return clone;
  }

  function updateField(path: string, value: any) {
    config = setPath(config, path, value);
    onchange();
  }

  let providers = $derived(Object.keys(config?.models?.providers || {}));

  let modelFallbacks = $derived((config?.reliability?.model_fallbacks || []) as string[]);
  let fallbackProviders = $derived((config?.reliability?.fallback_providers || []) as string[]);

  let configuredChannels = $derived(Object.keys(config?.channels || {}));

  function getChannelAccounts(channelType: string): string[] {
    const ch = config?.channels?.[channelType];
    if (!ch) return [];
    if (ch.accounts) return Object.keys(ch.accounts);
    return [];
  }

  function addChannel(type: string) {
    const schema = channelSchemas[type];
    if (!schema) return;
    if (type === 'cli') {
      updateField('channels.cli', true);
    } else if (schema.hasAccounts) {
      const defaults: Record<string, any> = { account_id: 'default' };
      for (const f of schema.fields) {
        if (f.default !== undefined) {
          const parts = f.key.split('.');
          if (parts.length === 1) {
            defaults[f.key] = f.default;
          } else {
            let cur: any = defaults;
            for (let i = 0; i < parts.length - 1; i++) {
              if (!cur[parts[i]]) cur[parts[i]] = {};
              cur = cur[parts[i]];
            }
            cur[parts[parts.length - 1]] = f.default;
          }
        }
      }
      updateField(`channels.${type}`, { accounts: { default: defaults } });
    } else {
      const defaults: Record<string, any> = {};
      for (const f of schema.fields) {
        if (f.default !== undefined) defaults[f.key] = f.default;
      }
      updateField(`channels.${type}`, defaults);
    }
    addChannelOpen = false;
    openSections[`channel-${type}`] = true;
  }

  function removeChannel(type: string) {
    const clone = JSON.parse(JSON.stringify(config));
    if (clone.channels) delete clone.channels[type];
    config = clone;
    onchange();
  }

  function parseList(value: any): string {
    if (Array.isArray(value)) return value.join('\n');
    return '';
  }

  function toList(text: string): string[] {
    return text.split('\n').map(s => s.trim()).filter(Boolean);
  }

  function fieldId(path: string): string {
    return `cfg-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  let availableChannels = $derived(
    Object.entries(channelSchemas)
      .filter(([key]) => !configuredChannels.includes(key))
      .map(([key, schema]) => ({ key, label: schema.label }))
  );
</script>

<div class="config-ui">
  <!-- Models & Providers section (staticSections[0]) -->
  <div class="section">
    <button class="accordion-header" onclick={() => toggle('models')}>
      <span class="accordion-arrow" class:open={openSections['models']}>&#9654;</span>
      <span>{staticSections[0].label}</span>
    </button>
    {#if openSections['models']}
      <div class="accordion-body">
        {#each staticSections[0].fields as field}
          {@const inputId = fieldId(field.key)}
          {#if field.type === 'number'}
            <div class="field">
              <Label for={inputId}>{field.label}</Label>
              <Input
                id={inputId}
                type="number"
                value={getPath(config, field.key) ?? field.default ?? ''}
                step={field.step}
                min={field.min}
                max={field.max}
                oninput={(e) => updateField(field.key, Number(e.currentTarget.value))}
              />
              {#if field.hint}
                <p class="hint">{field.hint}</p>
              {/if}
            </div>
          {:else if field.type === 'text'}
            <div class="field">
              <Label for={inputId}>{field.label}</Label>
              <Input
                id={inputId}
                type="text"
                value={getPath(config, field.key) ?? ''}
                oninput={(e) => updateField(field.key, e.currentTarget.value)}
              />
              {#if field.hint}
                <p class="hint">{field.hint}</p>
              {/if}
            </div>
          {/if}
        {/each}

        <!-- Dynamic provider API keys -->
        {#each providers as provider}
          {@const apiKeyId = fieldId(`models.providers.${provider}.api_key`)}
          {@const baseUrlId = fieldId(`models.providers.${provider}.base_url`)}
          <div class="provider-row">
            <div class="provider-name">{provider}</div>
            <div class="field">
              <Label for={apiKeyId}>API key</Label>
              <Input
                id={apiKeyId}
                type="password"
                value={getPath(config, `models.providers.${provider}.api_key`) ?? ''}
                oninput={(e) => updateField(`models.providers.${provider}.api_key`, e.currentTarget.value)}
              />
            </div>
            {#if getPath(config, `models.providers.${provider}.base_url`)}
              <div class="field">
                <Label for={baseUrlId}>Base URL</Label>
                <Input
                  id={baseUrlId}
                  type="text"
                  value={getPath(config, `models.providers.${provider}.base_url`) ?? ''}
                  oninput={(e) => updateField(`models.providers.${provider}.base_url`, e.currentTarget.value)}
                />
              </div>
            {/if}
          </div>
        {/each}

        <!-- Model Fallbacks -->
        <div class="field">
          <Label for={fieldId('reliability.model_fallbacks')}>Model fallbacks</Label>
          <Textarea
            id={fieldId('reliability.model_fallbacks')}
            value={parseList(modelFallbacks)}
            oninput={(e) => updateField('reliability.model_fallbacks', toList(e.currentTarget.value))}
            rows={3}
          />
          <p class="hint">One model per line</p>
        </div>

        <!-- Fallback Providers -->
        <div class="field">
          <Label for={fieldId('reliability.fallback_providers')}>Fallback providers</Label>
          <Textarea
            id={fieldId('reliability.fallback_providers')}
            value={parseList(fallbackProviders)}
            oninput={(e) => updateField('reliability.fallback_providers', toList(e.currentTarget.value))}
            rows={3}
          />
          <p class="hint">One provider per line</p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Channels heading -->
  <div class="channels-heading">Channels</div>

  <!-- Configured channels -->
  {#each configuredChannels as channelType}
    {@const schema = channelSchemas[channelType]}
    {#if schema}
      <div class="section">
        <div
          class="accordion-header channel-header"
          role="button"
          tabindex="0"
          aria-expanded={openSections[`channel-${channelType}`] ? 'true' : 'false'}
          onclick={() => toggle(`channel-${channelType}`)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(`channel-${channelType}`); } }}
        >
          <div class="accordion-left">
            <span class="accordion-arrow" class:open={openSections[`channel-${channelType}`]}>&#9654;</span>
            <span>{schema.label}</span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-destructive hover:text-destructive"
            title={`Remove ${schema.label} channel`}
            aria-label={`Remove ${schema.label} channel`}
            onclick={(e) => { e.stopPropagation(); removeChannel(channelType); }}
          >
            <XIcon />
          </Button>
        </div>
        {#if openSections[`channel-${channelType}`]}
          <div class="accordion-body">
            {#if channelType === 'cli'}
              <p class="cli-note">CLI channel enabled</p>
            {:else if schema.hasAccounts}
              {#each getChannelAccounts(channelType) as accountId}
                <div class="account-label">Account: {accountId}</div>
                {#each schema.fields as field}
                  {@const path = `channels.${channelType}.accounts.${accountId}.${field.key}`}
                  {@const value = getPath(config, path)}
                  {@const inputId = fieldId(path)}
                  {#if field.type === 'toggle'}
                    <label class="toggle-field">
                      <input
                        type="checkbox"
                        checked={!!value}
                        onchange={(e) => updateField(path, e.currentTarget.checked)}
                      />
                      <span>{field.label}</span>
                    </label>
                  {:else if field.type === 'number'}
                    <div class="field">
                      <Label for={inputId}>{field.label}</Label>
                      <Input
                        id={inputId}
                        type="number"
                        value={value ?? field.default ?? ''}
                        step={field.step}
                        min={field.min}
                        max={field.max}
                        oninput={(e) => updateField(path, Number(e.currentTarget.value))}
                      />
                      {#if field.hint}
                        <p class="hint">{field.hint}</p>
                      {/if}
                    </div>
                  {:else if field.type === 'text'}
                    <div class="field">
                      <Label for={inputId}>{field.label}</Label>
                      <Input
                        id={inputId}
                        type="text"
                        value={value ?? ''}
                        oninput={(e) => updateField(path, e.currentTarget.value)}
                      />
                      {#if field.hint}
                        <p class="hint">{field.hint}</p>
                      {/if}
                    </div>
                  {:else if field.type === 'password'}
                    <div class="field">
                      <Label for={inputId}>{field.label}</Label>
                      <Input
                        id={inputId}
                        type="password"
                        value={value ?? ''}
                        oninput={(e) => updateField(path, e.currentTarget.value)}
                      />
                      {#if field.hint}
                        <p class="hint">{field.hint}</p>
                      {/if}
                    </div>
                  {:else if field.type === 'select'}
                    <div class="field">
                      <Label for={inputId}>{field.label}</Label>
                      <Select id={inputId} value={value ?? ''} onchange={(e) => updateField(path, e.currentTarget.value)}>
                        {#each field.options ?? [] as opt}
                          <option value={opt}>{opt}</option>
                        {/each}
                      </Select>
                      {#if field.hint}
                        <p class="hint">{field.hint}</p>
                      {/if}
                    </div>
                  {:else if field.type === 'list'}
                    <div class="field">
                      <Label for={inputId}>{field.label}</Label>
                      <Textarea
                        id={inputId}
                        value={parseList(value)}
                        oninput={(e) => updateField(path, toList(e.currentTarget.value))}
                        rows={3}
                      />
                      {#if field.hint}
                        <p class="hint">{field.hint}</p>
                      {/if}
                    </div>
                  {/if}
                {/each}
              {/each}
            {:else}
              {#each schema.fields as field}
                {@const path = `channels.${channelType}.${field.key}`}
                {@const value = getPath(config, path)}
                {@const inputId = fieldId(path)}
                {#if field.type === 'toggle'}
                  <label class="toggle-field">
                    <input
                      type="checkbox"
                      checked={!!value}
                      onchange={(e) => updateField(path, e.currentTarget.checked)}
                    />
                    <span>{field.label}</span>
                  </label>
                {:else if field.type === 'number'}
                  <div class="field">
                    <Label for={inputId}>{field.label}</Label>
                    <Input
                      id={inputId}
                      type="number"
                      value={value ?? field.default ?? ''}
                      step={field.step}
                      min={field.min}
                      max={field.max}
                      oninput={(e) => updateField(path, Number(e.currentTarget.value))}
                    />
                    {#if field.hint}
                      <p class="hint">{field.hint}</p>
                    {/if}
                  </div>
                {:else if field.type === 'text'}
                  <div class="field">
                    <Label for={inputId}>{field.label}</Label>
                    <Input
                      id={inputId}
                      type="text"
                      value={value ?? ''}
                      oninput={(e) => updateField(path, e.currentTarget.value)}
                    />
                    {#if field.hint}
                      <p class="hint">{field.hint}</p>
                    {/if}
                  </div>
                {:else if field.type === 'password'}
                  <div class="field">
                    <Label for={inputId}>{field.label}</Label>
                    <Input
                      id={inputId}
                      type="password"
                      value={value ?? ''}
                      oninput={(e) => updateField(path, e.currentTarget.value)}
                    />
                    {#if field.hint}
                      <p class="hint">{field.hint}</p>
                    {/if}
                  </div>
                {:else if field.type === 'select'}
                  <div class="field">
                    <Label for={inputId}>{field.label}</Label>
                    <Select id={inputId} value={value ?? ''} onchange={(e) => updateField(path, e.currentTarget.value)}>
                      {#each field.options ?? [] as opt}
                        <option value={opt}>{opt}</option>
                      {/each}
                    </Select>
                    {#if field.hint}
                      <p class="hint">{field.hint}</p>
                    {/if}
                  </div>
                {:else if field.type === 'list'}
                  <div class="field">
                    <Label for={inputId}>{field.label}</Label>
                    <Textarea
                      id={inputId}
                      value={parseList(value)}
                      oninput={(e) => updateField(path, toList(e.currentTarget.value))}
                      rows={3}
                    />
                    {#if field.hint}
                      <p class="hint">{field.hint}</p>
                    {/if}
                  </div>
                {/if}
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  {/each}

  <!-- Add Channel button + dropdown -->
  <div class="add-channel">
    <Button variant="outline" class="w-full" onclick={() => addChannelOpen = !addChannelOpen}>
      <PlusIcon />
      Add channel
    </Button>
    {#if addChannelOpen}
      <div class="add-channel-dropdown">
        {#each availableChannels as ch}
          <button onclick={() => addChannel(ch.key)}>{ch.label}</button>
        {/each}
        {#if availableChannels.length === 0}
          <button disabled>All channels configured</button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Agent section (staticSections[1]) -->
  <div class="section">
    <button class="accordion-header" onclick={() => toggle('agent')}>
      <span class="accordion-arrow" class:open={openSections['agent']}>&#9654;</span>
      <span>{staticSections[1].label}</span>
    </button>
    {#if openSections['agent']}
      <div class="accordion-body">
        {#each staticSections[1].fields as field}
          {@const value = getPath(config, field.key)}
          {@const inputId = fieldId(field.key)}
          {#if field.type === 'toggle'}
            <label class="toggle-field">
              <input
                type="checkbox"
                checked={!!value}
                onchange={(e) => updateField(field.key, e.currentTarget.checked)}
              />
              <span>{field.label}</span>
            </label>
          {:else if field.type === 'number'}
            <div class="field">
              <Label for={inputId}>{field.label}</Label>
              <Input
                id={inputId}
                type="number"
                value={value ?? field.default ?? ''}
                step={field.step}
                min={field.min}
                max={field.max}
                oninput={(e) => updateField(field.key, Number(e.currentTarget.value))}
              />
              {#if field.hint}
                <p class="hint">{field.hint}</p>
              {/if}
            </div>
          {:else if field.type === 'text'}
            <div class="field">
              <Label for={inputId}>{field.label}</Label>
              <Input
                id={inputId}
                type="text"
                value={value ?? ''}
                oninput={(e) => updateField(field.key, e.currentTarget.value)}
              />
              {#if field.hint}
                <p class="hint">{field.hint}</p>
              {/if}
            </div>
          {:else if field.type === 'select'}
            <div class="field">
              <Label for={inputId}>{field.label}</Label>
              <Select id={inputId} value={value ?? ''} onchange={(e) => updateField(field.key, e.currentTarget.value)}>
                {#each field.options ?? [] as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </Select>
              {#if field.hint}
                <p class="hint">{field.hint}</p>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  <!-- Autonomy section (staticSections[2]) -->
  <div class="section">
    <button class="accordion-header" onclick={() => toggle('autonomy')}>
      <span class="accordion-arrow" class:open={openSections['autonomy']}>&#9654;</span>
      <span>{staticSections[2].label}</span>
    </button>
    {#if openSections['autonomy']}
      <div class="accordion-body">
        {#each staticSections[2].fields as field}
          {@const value = getPath(config, field.key)}
          {@const inputId = fieldId(field.key)}
          {#if field.type === 'toggle'}
            <label class="toggle-field">
              <input
                type="checkbox"
                checked={!!value}
                onchange={(e) => updateField(field.key, e.currentTarget.checked)}
              />
              <span>{field.label}</span>
            </label>
          {:else if field.type === 'number'}
            <div class="field">
              <Label for={inputId}>{field.label}</Label>
              <Input
                id={inputId}
                type="number"
                value={value ?? field.default ?? ''}
                step={field.step}
                min={field.min}
                max={field.max}
                oninput={(e) => updateField(field.key, Number(e.currentTarget.value))}
              />
              {#if field.hint}
                <p class="hint">{field.hint}</p>
              {/if}
            </div>
          {:else if field.type === 'text'}
            <div class="field">
              <Label for={inputId}>{field.label}</Label>
              <Input
                id={inputId}
                type="text"
                value={value ?? ''}
                oninput={(e) => updateField(field.key, e.currentTarget.value)}
              />
              {#if field.hint}
                <p class="hint">{field.hint}</p>
              {/if}
            </div>
          {:else if field.type === 'select'}
            <div class="field">
              <Label for={inputId}>{field.label}</Label>
              <Select id={inputId} value={value ?? ''} onchange={(e) => updateField(field.key, e.currentTarget.value)}>
                {#each field.options ?? [] as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </Select>
              {#if field.hint}
                <p class="hint">{field.hint}</p>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  <!-- Diagnostics section (staticSections[3]) -->
  <div class="section">
    <button class="accordion-header" onclick={() => toggle('diagnostics')}>
      <span class="accordion-arrow" class:open={openSections['diagnostics']}>&#9654;</span>
      <span>{staticSections[3].label}</span>
    </button>
    {#if openSections['diagnostics']}
      <div class="accordion-body">
        {#each staticSections[3].fields as field}
          {@const value = getPath(config, field.key)}
          {@const inputId = fieldId(field.key)}
          {#if field.type === 'toggle'}
            <label class="toggle-field">
              <input
                type="checkbox"
                checked={!!value}
                onchange={(e) => updateField(field.key, e.currentTarget.checked)}
              />
              <span>{field.label}</span>
            </label>
          {:else if field.type === 'number'}
            <div class="field">
              <Label for={inputId}>{field.label}</Label>
              <Input
                id={inputId}
                type="number"
                value={value ?? field.default ?? ''}
                step={field.step}
                min={field.min}
                max={field.max}
                oninput={(e) => updateField(field.key, Number(e.currentTarget.value))}
              />
              {#if field.hint}
                <p class="hint">{field.hint}</p>
              {/if}
            </div>
          {:else if field.type === 'text'}
            <div class="field">
              <Label for={inputId}>{field.label}</Label>
              <Input
                id={inputId}
                type="text"
                value={value ?? ''}
                oninput={(e) => updateField(field.key, e.currentTarget.value)}
              />
              {#if field.hint}
                <p class="hint">{field.hint}</p>
              {/if}
            </div>
          {:else if field.type === 'select'}
            <div class="field">
              <Label for={inputId}>{field.label}</Label>
              <Select id={inputId} value={value ?? ''} onchange={(e) => updateField(field.key, e.currentTarget.value)}>
                {#each field.options ?? [] as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </Select>
              {#if field.hint}
                <p class="hint">{field.hint}</p>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .config-ui {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section {
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
  }

  .accordion-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.875rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    font-weight: 600;
    transition: background-color 0.15s ease, color 0.15s ease;
  }
  .accordion-header:hover {
    background: var(--shadcn-accent);
  }

  .accordion-arrow {
    font-size: 0.625rem;
    transition: transform 0.2s ease;
    color: var(--shadcn-muted-foreground);
  }
  .accordion-arrow.open {
    transform: rotate(90deg);
  }

  .accordion-body {
    padding: 0 1rem 1rem;
    border-top: 1px solid var(--shadcn-border);
  }

  .field {
    margin-bottom: 1rem;
  }
  .field :global([data-slot="label"]) {
    margin-bottom: 0.375rem;
  }

  .toggle-field {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    margin-bottom: 0.75rem;
  }
  .toggle-field input[type="checkbox"] {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: var(--shadcn-foreground);
    cursor: pointer;
  }
  .toggle-field span {
    font-size: 0.875rem;
    color: var(--shadcn-foreground);
  }

  .hint {
    font-size: 0.75rem;
    color: var(--shadcn-muted-foreground);
    margin-top: 0.25rem;
  }

  .channel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }
  .channel-header .accordion-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .channels-heading {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--shadcn-muted-foreground);
    margin: 1rem 0 0.5rem;
  }

  .add-channel {
    position: relative;
    margin-top: 0.5rem;
  }

  .add-channel-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 10;
    background: var(--shadcn-card);
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    max-height: 300px;
    overflow-y: auto;
    margin-top: 0.25rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
  .add-channel-dropdown button {
    display: block;
    width: 100%;
    padding: 0.625rem 1rem;
    background: none;
    border: none;
    border-bottom: 1px solid var(--shadcn-border);
    color: var(--shadcn-foreground);
    font-size: 0.8125rem;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
  }
  .add-channel-dropdown button:hover {
    background: var(--shadcn-accent);
  }
  .add-channel-dropdown button:last-child {
    border-bottom: none;
  }

  .account-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--shadcn-muted-foreground);
    margin: 0.75rem 0 0.5rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--shadcn-border);
  }

  .provider-row {
    margin-bottom: 0.75rem;
  }
  .provider-name {
    font-size: 0.8125rem;
    color: var(--shadcn-foreground);
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  .cli-note {
    font-size: 0.8125rem;
    color: var(--shadcn-muted-foreground);
    padding: 0.5rem 0;
  }
</style>
