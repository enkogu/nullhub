<script lang="ts">
	import * as RadioGroup from './index.js';

	let { value = 'loops', disabled = false } = $props<{
		value?: string;
		disabled?: boolean;
	}>();
</script>

<RadioGroup.Root {value} {disabled} aria-label="Order kind">
	<div class="flex items-center gap-2">
		<RadioGroup.Item id="kind-loops" value="loops" />
		<label class="text-sm" for="kind-loops">Loops</label>
	</div>
	<div class="flex items-center gap-2">
		<RadioGroup.Item id="kind-workflows" value="workflows" />
		<label class="text-sm" for="kind-workflows">Workflows</label>
	</div>
</RadioGroup.Root>
