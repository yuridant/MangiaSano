import { useEffect, useState, type TouchEvent } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

const PRIMARY_LINKS = [
  { to: "/", label: "Menu", icon: "🗓" },
  { to: "/recipes", label: "Ricette", icon: "📖" },
  { to: "/shopping", label: "Spesa", icon: "🛒" },
  { to: "#more", label: "Altro", icon: "···" }
] as const;

const SECONDARY_LINKS = [
  { to: "/menu", label: "Menu settimanale" },
  { to: "/ingredients", label: "Ingredienti" },
  { to: "/analytics", label: "Analytics" },
  { to: "/family", label: "Famiglia" },
  { to: "/account", label: "Account" }
] as const;

const SIDEBAR_LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/menu", label: "Menu settimanale" },
  { to: "/menu/generate", label: "Genera con AI" },
  { to: "/recipes", label: "Ricette" },
  { to: "/ingredients", label: "Ingredienti" },
  { to: "/shopping", label: "Lista spesa" },
  { to: "/analytics", label: "Analytics" },
  { to: "/family", label: "Famiglia" },
  { to: "/account", label: "Account" }
] as const;

function matchesPath(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname.startsWith(to);
}

function isSidebarLinkActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  if (to === "/menu") return pathname === "/menu";
  return matchesPath(pathname, to);
}

function isPrimaryLinkActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/" || pathname === "/menu";
  return matchesPath(pathname, to);
}

export function AppShell() {
  const { user, families, activeFamilyId, isReady } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const activeFamily = families.find((family) => family.id === activeFamilyId) ?? null;

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setIsMobileMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sage border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  function handleTouchStart(e: TouchEvent<HTMLElement>) {
    setTouchStartY(e.touches[0]?.clientY ?? null);
  }

  function handleTouchEnd(e: TouchEvent<HTMLElement>) {
    if (touchStartY === null) return;
    const endY = e.changedTouches[0]?.clientY ?? touchStartY;
    const delta = touchStartY - endY;
    if (delta > 36) setIsMobileMenuOpen(true);
    if (delta < -36) setIsMobileMenuOpen(false);
    setTouchStartY(null);
  }

  return (
    <div
      className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pt-5 lg:flex-row lg:gap-6 lg:pb-5"
      style={{ paddingBottom: "calc(7.25rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* Sidebar desktop */}
      <aside className="hidden lg:sticky lg:top-5 lg:block lg:h-fit lg:w-[260px] lg:shrink-0">
        <div className="overflow-hidden rounded-[2rem] bg-ink text-white shadow-2xl">
          <div className="border-b border-white/10 bg-white/5 px-6 py-6">
            <p className="text-xs uppercase tracking-widest text-white/50">MangiaSano</p>
            <h1 className="mt-2 text-xl font-bold leading-snug">
              Mangia bene,<br />ogni settimana
            </h1>
            <div className="mt-5 rounded-[1.4rem] bg-white/10 p-4">
              <p className="text-sm font-semibold text-white">{user.name ?? user.email}</p>
              <p className="mt-1 text-xs text-white/60">{user.email}</p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/45">Famiglia attiva</p>
              <p className="mt-1 text-sm font-medium text-white/85">
                {activeFamily?.name ?? "Nessuna famiglia selezionata"}
              </p>
            </div>
          </div>
          <nav className="flex flex-col gap-1.5 p-4">
            {SIDEBAR_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={() =>
                  `rounded-[1.4rem] px-4 py-3 text-sm font-medium transition ${
                    isSidebarLinkActive(location.pathname, link.to)
                      ? "bg-white text-ink"
                      : "text-white/75 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 pb-4">
        <Outlet />
      </main>

      {/* Mobile nav */}
      <div className="lg:hidden">
        {isMobileMenuOpen && (
          <button
            aria-label="Chiudi menu"
            className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px]"
            onClick={() => setIsMobileMenuOpen(false)}
            type="button"
          />
        )}

        <div
          className="fixed inset-x-0 bottom-0 z-50 px-3"
          style={{ paddingBottom: "calc(0.6rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div
            className="mx-auto max-w-xl overflow-hidden app-mobile-nav"
            onTouchEnd={handleTouchEnd}
            onTouchStart={handleTouchStart}
          >
            {/* Secondary panel */}
            <div
              className={`grid transition-all duration-300 ease-out ${
                isMobileMenuOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="border-b border-slate-200/80 px-3 pb-3 pt-3">
                  <div className="mb-2 flex justify-center">
                    <span className="h-1.5 w-12 rounded-full bg-slate-300" />
                  </div>
                  <div className="mb-3 rounded-[1.2rem] bg-slate-100/90 px-4 py-3">
                    <p className="text-sm font-semibold text-ink">{user.name ?? user.email}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {activeFamily?.name ?? "Nessuna famiglia attiva"}
                    </p>
                  </div>
                  <nav className="grid gap-1.5">
                    {SECONDARY_LINKS.map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        className={({ isActive }) =>
                          `rounded-[1.2rem] px-4 py-3 text-sm font-semibold transition ${
                            isActive
                              ? "bg-ink text-white"
                              : "bg-slate-100/80 text-slate-700 hover:bg-slate-200/80"
                          }`
                        }
                      >
                        {link.label}
                      </NavLink>
                    ))}
                  </nav>
                </div>
              </div>
            </div>

            {/* Primary tabs */}
            <div className="grid grid-cols-4 gap-1 px-1 py-1">
              {PRIMARY_LINKS.map((link) =>
                link.to === "#more" ? (
                  <button
                    key="more"
                    type="button"
                    onClick={() => setIsMobileMenuOpen((o) => !o)}
                    className={`app-mobile-nav-item ${
                      isMobileMenuOpen
                        ? "app-mobile-nav-item-active"
                        : "app-mobile-nav-item-inactive"
                    }`}
                  >
                    <span className="text-lg">{link.icon}</span>
                  </button>
                ) : (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={() =>
                      `app-mobile-nav-item ${
                        isPrimaryLinkActive(location.pathname, link.to) && !isMobileMenuOpen
                          ? "app-mobile-nav-item-active"
                          : "app-mobile-nav-item-inactive"
                      }`
                    }
                  >
                    <span className="text-lg">{link.icon}</span>
                  </NavLink>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
