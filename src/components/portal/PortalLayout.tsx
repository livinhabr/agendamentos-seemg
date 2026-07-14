import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
  Home,
  Building2,
  MessageSquare,
  Users,

  Settings,
  Menu,
  X,
  LogOut,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectorProvider, useSector } from "@/lib/context/SectorContext";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/inicio", label: "Início", icon: Home },
  { to: "/meu-setor", label: "Meu Setor", icon: Building2 },
  { to: "/chat-agendamento", label: "Chat de Agendamento", icon: MessageSquare },
  { to: "/equipe-agenda", label: "Equipe e Agenda", icon: Users },

  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <SectorProvider>
      <Shell>{children}</Shell>
    </SectorProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { loading } = useSector();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar mobileOpen={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-card transition-transform md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">Agenda Setorial</p>
            <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
              SEE-MG
            </p>
          </div>
          <button className="md:hidden" onClick={onClose} aria-label="Fechar menu">
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="space-y-0.5 overflow-y-auto p-2 text-sm">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`flex items-center gap-2 rounded-md px-3 py-2 transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function Header({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate();
  const {
    sectors,
    bots,
    selectedSectorId,
    selectedBotId,
    setSelectedSectorId,
    setSelectedBotId,
    userEmail,
  } = useSector();

  const botsForSector = bots.filter((b) => b.setor_id === selectedSectorId);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4 sm:px-8">
      <button className="md:hidden" onClick={onMenu} aria-label="Abrir menu">
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {sectors.length > 1 ? (
          <select
            value={selectedSectorId ?? ""}
            onChange={(e) => setSelectedSectorId(e.target.value || null)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        ) : (
          <span className="truncate text-sm font-medium text-foreground">
            {sectors[0]?.nome ?? "Sem setor"}
          </span>
        )}

        {botsForSector.length > 0 && (
          <select
            value={selectedBotId ?? ""}
            onChange={(e) => setSelectedBotId(e.target.value || null)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {botsForSector.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="hidden text-right text-xs text-muted-foreground sm:block">
        <p className="truncate max-w-[200px]">{userEmail}</p>
      </div>
      <Button size="sm" variant="outline" onClick={signOut} className="gap-1">
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Sair</span>
      </Button>
    </header>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      {title && <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>}
      {children}
    </section>
  );
}
