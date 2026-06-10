<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as Sidebar from './index.js';

	const { Story } = defineMeta({
		title: 'UI/Sidebar',
		component: Sidebar.Sidebar,
		argTypes: {
			open: {
				control: 'boolean'
			},
			collapsible: {
				control: 'select',
				options: ['offcanvas', 'icon', 'none']
			},
			variant: {
				control: 'select',
				options: ['sidebar', 'floating', 'inset']
			},
			side: {
				control: 'select',
				options: ['left', 'right']
			}
		}
	});
</script>

{#snippet sidebarTemplate(args)}
	<div class="h-80 w-[28rem] overflow-hidden rounded-md border">
		<Sidebar.Provider open={args.open} class="min-h-full">
			<Sidebar.Sidebar
				collapsible={args.collapsible}
				variant={args.variant}
				side={args.side}
			>
				<Sidebar.Header>
					<div class="px-2 py-1 text-sm font-semibold">Volksdroid</div>
				</Sidebar.Header>
				<Sidebar.Content>
					<Sidebar.Group>
						<Sidebar.GroupLabel>Studio</Sidebar.GroupLabel>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive>Home</Sidebar.MenuButton>
								</Sidebar.MenuItem>
								<Sidebar.MenuItem>
									<Sidebar.MenuButton tooltipContent="Work">Work</Sidebar.MenuButton>
								</Sidebar.MenuItem>
								<Sidebar.MenuItem>
									<Sidebar.MenuButton>Orders</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Sidebar.Group>
				</Sidebar.Content>
				<Sidebar.Footer>
					<Sidebar.Menu>
						<Sidebar.MenuItem>
							<Sidebar.MenuButton size="sm">System</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					</Sidebar.Menu>
				</Sidebar.Footer>
			</Sidebar.Sidebar>
			<Sidebar.Inset class="min-h-full p-4">
				<p class="text-sm font-medium">Selected surface</p>
				<p class="text-sm text-muted-foreground">Home overview</p>
			</Sidebar.Inset>
		</Sidebar.Provider>
	</div>
{/snippet}

<Story
	name="Expanded"
	args={{ open: true, collapsible: 'offcanvas', variant: 'sidebar', side: 'left' }}
	template={sidebarTemplate}
/>
<Story
	name="Collapsed Icon"
	args={{ open: false, collapsible: 'icon', variant: 'sidebar', side: 'left' }}
	template={sidebarTemplate}
/>
<Story
	name="Floating Right"
	args={{ open: true, collapsible: 'offcanvas', variant: 'floating', side: 'right' }}
	template={sidebarTemplate}
/>
