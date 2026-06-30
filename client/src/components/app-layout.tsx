import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, FolderKanban, FileText, Package,
  Clock, Settings, LogOut, ChevronLeft, Menu, Receipt,
  FileInput, Calculator, Gauge, CalendarDays, ListTodo, BarChart3,
  Upload, User, Coins, BookOpen, MessageSquareText,
  Bell, Mailbox, ScrollText, HardHat, Wrench, Hash,
  Layers, DollarSign, Warehouse, ShoppingCart, PenTool, List, CreditCard, Landmark
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { canAccessRoute, ROLE_LABELS, type UserRole } from "@shared/permissions";

const logoUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%230f766e'/%3E%3Ctext x='32' y='40' text-anchor='middle' font-family='Arial,sans-serif' font-size='24' font-weight='700' fill='white'%3EFB%3C/text%3E%3C/svg%3E";

const navGroups = [
  {
    label: null,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Dokumente & Projekte",
    items: [
      { href: "/dokumente", label: "Dokumente", icon: FileText },
      { href: "/projekte", label: "Projekte", icon: FolderKanban },
      { href: "/vertraege", label: "Verträge / Bautgb.", icon: ScrollText },
    ],
  },
  {
    label: "Finanzen",
    items: [
      { href: "/rechnungsbuch", label: "Rechnungsausgang", icon: Receipt },
      { href: "/offene-posten", label: "OP's & Mahnungen", icon: Coins },
      { href: "/rechnungseingang", label: "Rechnungseingang", icon: FileInput },
      { href: "/kassenbuch", label: "Kassenbuch", icon: BookOpen },
      { href: "/bank", label: "Bank", icon: Landmark },
      { href: "/ueberweisungen", label: "Überweisungen", icon: CreditCard },
      { href: "/finanzen", label: "Finanzbuchhaltung", icon: DollarSign },
    ],
  },
  {
    label: "Personal & Zeit",
    items: [
      { href: "/mitarbeiter", label: "Mitarbeiter / AG-Kosten", icon: Users },
      { href: "/lohnstunden", label: "Lohnstunden", icon: Clock },
      { href: "/ressourcen", label: "Ressourcen", icon: CalendarDays },
      { href: "/termine", label: "Termine / Personal", icon: HardHat },
    ],
  },
  {
    label: "Kalkulation",
    items: [
      { href: "/nachkalkulation", label: "Nachkalkulation", icon: Calculator },
      { href: "/disposition", label: "Disposition", icon: ListTodo },
      { href: "/stuecklisten", label: "Stücklisten", icon: Layers },
    ],
  },
  {
    label: "Organisation",
    items: [
      { href: "/wiedervorlagen", label: "Wiedervorlagen", icon: Bell },
      { href: "/postbuch", label: "Postbuch", icon: Mailbox },
    ],
  },
  {
    label: "Lager & Material",
    items: [
      { href: "/materialstamm", label: "Materialstamm", icon: Wrench },
      { href: "/lager", label: "Lager / Bestell.", icon: Warehouse },
    ],
  },
  {
    label: "Stammdaten",
    items: [
      { href: "/adressen", label: "Adress-Stamm", icon: Users },
      { href: "/stundensatz", label: "Stundensatz", icon: Gauge },
      { href: "/bwa", label: "BWA", icon: BarChart3 },
      { href: "/floskeln", label: "Floskeln", icon: MessageSquareText },
      { href: "/designer", label: "Formulare", icon: PenTool },
      { href: "/import", label: "Datenimport", icon: Upload },
      { href: "/einstellungen", label: "Einstellungen", icon: Settings },
    ],
  },
];

type NavItemType = { href: string; label: string; icon: typeof LayoutDashboard };

function NavItem({ item, location, collapsed, onMobileClose }: { item: NavItemType; location: string; collapsed: boolean; onMobileClose: () => void }) {
  const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
  return (
    <Link key={item.href} href={item.href}>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] font-medium cursor-pointer transition-all duration-150 relative",
          isActive
            ? "bg-white/[0.11] text-white shadow-sm ring-1 ring-white/[0.08]"
            : "text-slate-400 hover:text-white hover:bg-white/[0.06]"
        )}
        onClick={onMobileClose}
        data-testid={`nav-${item.href.slice(1) || "dashboard"}`}
        title={collapsed ? item.label : undefined}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-cyan-400" />
        )}
        <item.icon className={cn(
            "h-3.5 w-3.5 flex-shrink-0 transition-colors",
          isActive ? "text-cyan-300" : "text-slate-500 group-hover:text-slate-300"
        )} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </div>
    </Link>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  const role = user?.role || "mitarbeiter";
  const roleLabel = ROLE_LABELS[role as UserRole] || role;

  const filteredNavGroups = useMemo(() => {
    return navGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item => canAccessRoute(role, item.href)),
      }))
      .filter(group => group.items.length > 0);
  }, [role]);

  return (
    <div className="flex h-screen overflow-hidden app-surface">
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={closeMobile}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col gradient-sidebar border-r border-white/[0.07] transition-all duration-200 shadow-2xl lg:shadow-none",
          "lg:relative lg:z-auto",
          collapsed ? "w-16" : "w-56",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className={cn(
          "flex items-center gap-2 px-3 h-12 border-b border-white/[0.07]",
          collapsed && "justify-center px-2"
        )}>
          {collapsed ? (
            <div className="w-7 h-7 rounded-md bg-white/[0.10] ring-1 ring-white/[0.08] flex items-center justify-center">
              <img src={logoUrl} alt="FB" className="h-4 w-4 object-contain brightness-0 invert" data-testid="img-logo" />
            </div>
          ) : (
            <div className="flex items-center gap-2" data-testid="text-company-name">
              <div className="w-7 h-7 rounded-md bg-white/[0.10] ring-1 ring-white/[0.08] flex items-center justify-center flex-shrink-0">
                <img src={logoUrl} alt="FB" className="h-4 w-4 object-contain brightness-0 invert" data-testid="img-logo" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">FriStD-Bau ZuB</p>
                <p className="text-[9px] text-slate-500 leading-none">Handwerk ERP</p>
              </div>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 py-2">
          <nav className="space-y-1 px-2">
            {filteredNavGroups.map((group, gi) => (
              <div key={gi}>
                {gi > 0 && <div className="my-2 mx-3 h-px bg-white/[0.06]" />}
                {group.label && !collapsed && (
                  <div className="px-3 pt-0.5 pb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    {group.label}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavItem key={item.href} item={item} location={location} collapsed={collapsed} onMobileClose={closeMobile} />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        <div className={cn(
          "border-t border-white/[0.07] p-2",
          collapsed && "flex flex-col items-center"
        )}>
          {!collapsed && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-7 h-7 rounded-md bg-cyan-500/90 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 shadow-sm">
                {user?.fullName?.split(" ").map(n => n[0]).join("").slice(0, 2) || "?"}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-white truncate" data-testid="text-user-name">{user?.fullName}</p>
                <p className="text-[9px] text-slate-400">{roleLabel}</p>
              </div>
            </div>
          )}
          <div className={cn("flex gap-1", collapsed ? "flex-col" : "")}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed(!collapsed)}
              className="hidden lg:flex text-slate-400 hover:text-white hover:bg-white/[0.06]"
              data-testid="button-toggle-sidebar"
            >
              <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
              className="text-slate-400 hover:text-white hover:bg-white/[0.06]"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span className="ml-2">Abmelden</span>}
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-card-border px-4 py-3 lg:hidden bg-card/95 backdrop-blur">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} data-testid="button-mobile-menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-sm font-semibold leading-tight">FriStD-Bau ZuB</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">Handwerk ERP</p>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
