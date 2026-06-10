<script lang="ts">
	import * as Popover from './index.js';

	let { open = false, disabled = false } = $props<{
		open?: boolean;
		disabled?: boolean;
	}>();
</script>

<Popover.Root {open}>
	<Popover.Trigger disabled={disabled}>Open order tools</Popover.Trigger>
	<Popover.Content>
		<Popover.Header>
			<Popover.Title>Order tools</Popover.Title>
			<Popover.Description>Review schedule controls before launch.</Popover.Description>
		</Popover.Header>
		<Popover.Close>Done</Popover.Close>
	</Popover.Content>
</Popover.Root>
