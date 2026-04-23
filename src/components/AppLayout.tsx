import { useAuth } from "@/contexts/AuthContext";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCircle,
  LogOut,
  Settings,
  Sparkles,
  Clock,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

const navByRole = {
  admin: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/employees", label: "Employees", icon: Users },
    { to: "/departments", label: "Departments", icon: Building2 },
    { to: "/attendance", label: "Attendance", icon: Clock },
    { to: "/leave", label: "Leave", icon: CalendarDays },
    { to: "/profile", label: "My Profile", icon: UserCircle },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
  hr: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/employees", label: "Employees", icon: Users },
    { to: "/departments", label: "Departments", icon: Building2 },
    { to: "/attendance", label: "Attendance", icon: Clock },
    { to: "/leave", label: "Leave", icon: CalendarDays },
    { to: "/profile", label: "My Profile", icon: UserCircle },
  ],
  employee: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/attendance", label: "Attendance", icon: Clock },
    { to: "/leave", label: "Leave", icon: CalendarDays },
    { to: "/profile", label: "My Profile", icon: UserCircle },
  ],
} as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useAuth();
  const location = useLocation();
  const items = role ? navByRole[role] : [];

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="px-6 py-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display text-lg leading-none">Atrium</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                HR Suite
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {items.map((it) => {
            const Icon = it.icon;
            const active = location.pathname === it.to;
            return (
              <NavLink
                key={it.to}
                to={it.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                }`}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="px-3 py-2 text-xs">
            <div className="truncate text-sidebar-foreground font-medium">
              {user?.email}
            </div>
            <div className="text-muted-foreground capitalize mt-0.5">{role}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-display text-lg">Atrium</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex overflow-x-auto px-2 pb-2 gap-1">
          {items.map((it) => {
            const active = location.pathname === it.to;
            return (
              <NavLink
                key={it.to}
                to={it.to}
                className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {it.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <main className="flex-1 min-w-0 pt-28 md:pt-0">
        <div className="px-4 sm:px-8 lg:px-12 py-8 md:py-12 max-w-7xl mx-auto animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
