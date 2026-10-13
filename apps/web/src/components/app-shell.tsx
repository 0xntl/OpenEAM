import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  ArrowLeftRight,
  Blocks,
  Home,
  Library,
  Map as MapIcon,
  Route,
  ShieldCheck,
  Table2,
  Target,
  Users,
  Workflow,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Brand, BrandIcon } from './brand/brand';
import { CommandPalette, CommandPaletteTrigger } from './command-palette';
import { EnterpriseSwitcher } from './enterprise-switcher';
import { ThemeToggle } from './theme-toggle';
import { Button } from './ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from './ui/sidebar';
import { TooltipProvider } from './ui/tooltip';
import { UserMenu } from './user-menu';

// The collapsed sidebar's one control: the instance's icon, which opens the
// menu. Replaces the panel icon rather than sitting next to it.
function CollapsedBrandTrigger() {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      data-sidebar="trigger"
      variant="ghost"
      size="icon-lg"
      className="hidden group-data-[collapsible=icon]:inline-flex"
      onClick={toggleSidebar}
      title="Open the menu"
    >
      <BrandIcon />
      <span className="sr-only">Open the menu</span>
    </Button>
  );
}

export function AppShell() {
  const isOverview = useRouterState({
    select: (s) => s.location.pathname === '/',
  });
  const isValueStreams = useRouterState({
    select: (s) => s.location.pathname.startsWith('/value-streams'),
  });
  const isCapabilities = useRouterState({
    select: (s) => s.location.pathname.startsWith('/capabilities'),
  });
  const isBusinessProcesses = useRouterState({
    select: (s) => s.location.pathname.startsWith('/business-processes'),
  });
  const isActors = useRouterState({
    select: (s) => s.location.pathname.startsWith('/actors'),
  });
  const isInformation = useRouterState({
    select: (s) => s.location.pathname.startsWith('/information-objects'),
  });
  const isBuildingBlocks = useRouterState({
    select: (s) => s.location.pathname.startsWith('/building-blocks'),
  });
  // The diagram is the flagship landscape view, so it owns the plain
  // "Landscape" nav entry; the table is a separate, secondary entry (see
  // routes/landscape/index.tsx) — hence an exact match here rather than
  // startsWith, so the two don't both light up together.
  const isLandscapeDiagram = useRouterState({
    select: (s) => s.location.pathname.startsWith('/landscape/diagram'),
  });
  const isLandscapeTable = useRouterState({
    select: (s) => s.location.pathname === '/landscape',
  });
  const isDataExchange = useRouterState({
    select: (s) => s.location.pathname.startsWith('/data-exchange'),
  });
  const isAdmin = useRouterState({
    select: (s) => s.location.pathname.startsWith('/admin'),
  });
  const { isAdmin: canAdmin } = useAuth();

  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider defaultOpen={false}>
        <Sidebar collapsible="icon">
          <SidebarHeader className="font-semibold text-base">
            {/* Expanded: logo (or mark and name) beside the collapse trigger.
                Collapsed, the primary state: the brand icon *is* the trigger,
                one symbol that identifies the instance and opens the menu. */}
            <div className="flex items-center justify-between">
              <Brand className="px-1 group-data-[collapsible=icon]:hidden" />
              <SidebarTrigger size="icon-lg" className="group-data-[collapsible=icon]:hidden" />
              <CollapsedBrandTrigger />
            </div>
            <EnterpriseSwitcher />
            <CommandPaletteTrigger
              onOpen={() => window.dispatchEvent(new CustomEvent('openeam:palette'))}
            />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isOverview} tooltip="Overview">
                      <Link to="/">
                        <Home strokeWidth={2} />
                        <span className="group-data-[collapsible=icon]:hidden">Overview</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Business and Architecture mirror the layers this app already
                models (business capabilities/processes vs. building blocks/
                landscape). No group labels — the sidebar defaults to
                collapsed/icon-only (its primary state, see CLAUDE.md) where
                text labels vanish anyway, so SidebarSeparator alone marks
                each group's boundary, in both states, without relying on
                text that only sometimes renders. */}
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isValueStreams} tooltip="Value Streams">
                      <Link to="/value-streams">
                        <Route strokeWidth={2} />
                        <span className="group-data-[collapsible=icon]:hidden">Value Streams</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isCapabilities}
                      tooltip="Business Capabilities"
                    >
                      <Link to="/capabilities">
                        <Target strokeWidth={2} />
                        <span className="group-data-[collapsible=icon]:hidden">
                          Business Capabilities
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isBusinessProcesses}
                      tooltip="Business Processes"
                    >
                      <Link to="/business-processes">
                        <Workflow strokeWidth={2} />
                        <span className="group-data-[collapsible=icon]:hidden">
                          Business Processes
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActors} tooltip="Actors">
                      <Link to="/actors">
                        <Users strokeWidth={2} />
                        <span className="group-data-[collapsible=icon]:hidden">Actors</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isInformation} tooltip="Information">
                      <Link to="/information-objects">
                        <Library strokeWidth={2} />
                        <span className="group-data-[collapsible=icon]:hidden">Information</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isBuildingBlocks}
                      tooltip="Building Blocks"
                    >
                      <Link to="/building-blocks">
                        <Blocks strokeWidth={2} />
                        <span className="group-data-[collapsible=icon]:hidden">
                          Building Blocks
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isLandscapeDiagram} tooltip="Landscape">
                      <Link to="/landscape/diagram">
                        <MapIcon strokeWidth={2} />
                        <span className="group-data-[collapsible=icon]:hidden">Landscape</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isLandscapeTable}
                      tooltip="Landscape Table"
                    >
                      <Link to="/landscape">
                        <Table2 strokeWidth={2} />
                        <span className="group-data-[collapsible=icon]:hidden">
                          Landscape Table
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isDataExchange} tooltip="Data Exchange">
                      <Link to="/data-exchange">
                        <ArrowLeftRight strokeWidth={2} />
                        <span className="group-data-[collapsible=icon]:hidden">Data Exchange</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* Instance administration: accounts, sign-up, access to
                      enterprises. Only an instance admin sees the entry; the
                      page itself refuses everyone else too. */}
                  {canAdmin && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isAdmin} tooltip="Administration">
                        <Link to="/admin">
                          <ShieldCheck strokeWidth={2} />
                          <span className="group-data-[collapsible=icon]:hidden">
                            Administration
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <ThemeToggle />
            <UserMenu />
          </SidebarFooter>
        </Sidebar>

        <CommandPalette />
        <div className="flex flex-1 flex-col min-h-screen">
          {/* No padding here — each page's own width class
              (contentWidthClassName/canvasWidthClassName/
              fullBleedCanvasClassName, see ui/page-header.tsx) is the sole
              owner of its spacing. Main used to carry px-6 pb-6 of its own,
              which silently double-padded every page's right/bottom edge
              once those width classes gained their own px-6 pb-8. */}
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
