import { useLocation } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { menuItems } from "./AdminSidebar";
import { DataModeSwitch } from "./DataModeSwitch";

export function AdminHeader() {
  const { user } = useAuth();
  const location = useLocation();

  const initials = user?.email?.slice(0, 2).toUpperCase() || "AD";
  const activeItem = menuItems.find((item) =>
    item.url === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(item.url)
  );

  return (
    <header
      style={{ top: "var(--p2g-banner-h, 0px)" }}
      className="sticky z-40 flex h-[66px] items-center justify-between gap-4 border-b border-[hsl(0_0%_12%)] bg-[hsl(0_0%_2%/0.86)] px-4 backdrop-blur-xl sm:px-6"
    >
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        <span className="hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.14em] text-[hsl(0_0%_58%)] md:inline">
          {location.pathname}
        </span>
        <span className="hidden h-4 w-px flex-none bg-[hsl(0_0%_18%)] md:block" />
        <h1 className="truncate font-display text-[19px] font-extrabold tracking-tight text-foreground">
          {activeItem?.title ?? "Admin Dashboard"}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <DataModeSwitch />
        <div className="flex items-center gap-2.5 rounded-full border border-[hsl(0_0%_14%)] bg-white/[0.04] py-[5px] pl-[5px] pr-3">
          <span className="flex h-[27px] w-[27px] flex-none items-center justify-center rounded-full bg-gradient-lime font-display text-[11px] font-extrabold text-primary-foreground">
            {initials}
          </span>
          <span className="hidden max-w-[200px] truncate text-[13px] font-semibold text-foreground md:block">
            {user?.email}
          </span>
        </div>
      </div>
    </header>
  );
}
