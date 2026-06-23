import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PortalLayout, PageHeader, Section } from "@/components/portal/PortalLayout";
import { useSector } from "@/lib/context/SectorContext";
import {
  getAppointmentsBySector,
  getAttendantsBySector,
  getSchedulesBySector,
  getServicesBySector,
} from "@/lib/data/agenda";
import { Briefcase, Users, Clock, CalendarCheck, MessageSquare, Building2, Bot as BotIcon, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/inicio")({
  head: () => ({ meta: [{ title: "Início — Agenda Setorial SEE-MG" }] }),
  component: () => (
    <PortalLayout>
      <InicioPage />
    </PortalLayout>
  ),
});

function InicioPage() {
  const { selectedSectorId, selectedBotId, sectors, bots } = useSector();
  const sector = sectors.find((s) => s.id === selectedSectorId);
  const bot = bots.find((b) => b.id === selectedBotId);

  const [counts, setCounts] = useState({ servicos: 0, atendentes: 0, horarios: 0, agendamentos: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedSectorId) return;
    setLoading(true);
    const sids = [selectedSectorId];
    Promise.all([
      getServicesBySector(sids),
      getAttendantsBySector(sids),
      getSchedulesBySector(sids),
      getAppointmentsBySector(sids),
    ]).then(([s, a, h, ag]) => {
      setCounts({
        servicos: s.data.length,
        atendentes: a.data.length,
        horarios: h.data.length,
        agendamentos: ag.data.length,
      });
      setLoading(false);
    });
  }, [selectedSectorId]);

  const cards = [
    { label: "Serviços", value: counts.servicos, icon: Briefcase, to: "/chat-agendamento" },
    { label: "Atendentes", value: counts.atendentes, icon: Users, to: "/equipe-agenda" },
    { label: "Horários", value: counts.horarios, icon: Clock, to: "/equipe-agenda" },
    { label: "Chat publicado", value: bot?.ativo === false ? "Não" : "Sim", icon: MessageSquare, to: "/chat-agendamento" },
    { label: "Agendamentos", value: counts.agendamentos, icon: CalendarCheck, to: "/agendamentos" },
  ];

  const steps = [
    { ok: !!sector?.nome, label: "Configurar dados do setor", to: "/meu-setor" },
    { ok: !!bot?.nome, label: "Criar bot principal", to: "/meu-setor" },
    { ok: counts.servicos > 0, label: "Cadastrar pelo menos um serviço", to: "/chat-agendamento" },
    { ok: counts.atendentes > 0, label: "Adicionar atendentes", to: "/equipe-agenda" },
    { ok: counts.horarios > 0, label: "Definir horários de atendimento", to: "/equipe-agenda" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={`Bem-vindo${sector?.nome ? `, ${sector.nome}` : ""}`}
        description="Visão geral do seu setor."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Setor atual">
          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{sector?.nome ?? "—"}</p>
              <p className="truncate text-xs text-muted-foreground">{sector?.slug ?? ""}</p>
            </div>
          </div>
        </Section>
        <Section title="Bot principal">
          <div className="flex items-start gap-3">
            <BotIcon className="h-5 w-5 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{bot?.nome ?? "Nenhum bot configurado"}</p>
              <p className="truncate text-xs text-muted-foreground">{bot?.slug ?? ""}</p>
            </div>
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.label}
              to={c.to}
              className="rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-primary/50"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{loading ? "…" : c.value}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </Link>
          );
        })}
      </div>

      <Section title="Próximos passos">
        <ul className="space-y-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                {s.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                <span className={s.ok ? "text-muted-foreground line-through" : "text-foreground"}>{s.label}</span>
              </div>
              {!s.ok && (
                <Link to={s.to} className="text-xs font-medium text-primary hover:underline">
                  Configurar →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
