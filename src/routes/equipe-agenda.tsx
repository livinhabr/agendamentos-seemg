import { createFileRoute } from "@tanstack/react-router";
import { PortalLayout, PageHeader, Section } from "@/components/portal/PortalLayout";
import { CrudTable, type FieldDef } from "@/components/portal/CrudTable";
import { Button } from "@/components/ui/button";
import { useSector } from "@/lib/context/SectorContext";
import { useResource } from "@/lib/hooks/useResource";
import {
  getAttendantsBySector,
  getCalendarsBySector,
  getExceptionsBySector,
  getSchedulesBySector,
  getServicesBySector,
  isInstitutionalEmail,
  getAttendantServicesBySector,
  saveAttendantWithServices,
} from "@/lib/data/agenda";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/equipe-agenda")({
  head: () => ({ meta: [{ title: "Equipe e Agenda — Agenda SEE-MG" }] }),
  component: () => (
    <PortalLayout>
      <EquipeAgendaPage />
    </PortalLayout>
  ),
});

const DIAS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda" },
  { value: "2", label: "Terça" },
  { value: "3", label: "Quarta" },
  { value: "4", label: "Quinta" },
  { value: "5", label: "Sexta" },
  { value: "6", label: "Sábado" },
];

function EquipeAgendaPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Equipe e Agenda" description="Atendentes, horários, exceções e calendários." />
      <Tabs defaultValue="atendentes">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="atendentes">Atendentes</TabsTrigger>
          <TabsTrigger value="horarios">Horários e pausas</TabsTrigger>
          <TabsTrigger value="excecoes">Exceções</TabsTrigger>
          <TabsTrigger value="calendarios">Calendários / e-mails</TabsTrigger>
        </TabsList>
        <TabsContent value="atendentes"><AtendentesTab /></TabsContent>
        <TabsContent value="horarios"><HorariosTab /></TabsContent>
        <TabsContent value="excecoes"><ExcecoesTab /></TabsContent>
        <TabsContent value="calendarios"><CalendariosTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function AtendentesTab() {
  const { selectedSectorId } = useSector();
  const { data, error, loading, reload } = useResource(
    async () => {
      const attendantsRes = await getAttendantsBySector(selectedSectorId ? [selectedSectorId] : []);
      if (attendantsRes.error || !attendantsRes.data) return attendantsRes;

      const linksRes = await getAttendantServicesBySector(selectedSectorId ? [selectedSectorId] : []);
      const links = linksRes.data ?? [];

      const attendants = attendantsRes.data.map((att: any) => ({
        ...att,
        servicos_ids: links.filter((l: any) => l.atendente_id === att.id).map((l: any) => l.servico_id),
      }));

      return { data: attendants, error: null };
    },
    [selectedSectorId],
  );

  const servicos = useResource(
    () => getServicesBySector(selectedSectorId ? [selectedSectorId] : []),
    [selectedSectorId],
  );

  const calendarios = useResource(
    () => getCalendarsBySector(selectedSectorId ? [selectedSectorId] : []),
    [selectedSectorId],
  );

  const fields: FieldDef[] = [
    { name: "nome", label: "Nome", required: true },
    { name: "email", label: "E-mail institucional", type: "email", required: true, hint: "Deve ser @educacao.mg.gov.br" },
    { name: "telefone", label: "Telefone" },
    { name: "cargo", label: "Cargo" },
    {
      name: "calendario_id",
      label: "Calendário vinculado",
      type: "select",
      options: calendarios.data.map((c: any) => ({ value: c.id, label: `${c.nome} (${c.google_calendar_id ?? "—"})` })),
    },
    {
      name: "servicos_ids",
      label: "Serviços vinculados",
      type: "select-multiple",
      options: servicos.data.map((s: any) => ({ value: s.id, label: s.nome })),
    },
    { name: "ativo", label: "Ativo", type: "checkbox", defaultValue: true },
  ];

  return (
    <Section>
      <CrudTable
        title="Atendentes"
        table="atendentes"
        rows={data}
        columns={[
          { key: "nome", label: "Nome" },
          { key: "email", label: "E-mail" },
          { key: "cargo", label: "Cargo" },
          {
            key: "servicos_ids",
            label: "Serviços",
            render: (r) => {
              const names = (r.servicos_ids ?? [])
                .map((sid: string) => servicos.data.find((s: any) => s.id === sid)?.nome)
                .filter(Boolean);
              return names.length > 0 ? names.join(", ") : "Nenhum";
            },
          },
          {
            key: "google_connection",
            label: "Google Calendar",
            render: (r) => {
              const conn = r.google_connection;
              const handleConnect = () => {
                const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-google-start?atendente_id=${r.id}`;
                window.location.href = url;
              };

              if (!r.id) return <span className="text-muted-foreground text-xs">Salve primeiro</span>;

              if (conn?.status === "connected") {
                return (
                  <div className="flex flex-col gap-1">
                    <span className="text-emerald-600 font-medium text-xs">Conectado</span>
                    <span className="text-xs text-muted-foreground">{conn.google_email}</span>
                    <Button variant="outline" size="sm" onClick={handleConnect} className="h-6 text-[10px] mt-1">
                      Reconectar
                    </Button>
                  </div>
                );
              }

              return (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">
                    {conn?.status === "error" ? "Erro na conexão" : "Não conectado"}
                  </span>
                  <Button variant="default" size="sm" onClick={handleConnect} className="h-6 text-[10px]">
                    Conectar
                  </Button>
                </div>
              );
            }
          },
        ]}
        fields={fields}
        loading={loading}
        error={error}
        baseRow={{ setor_id: selectedSectorId }}
        validate={(row) =>
          row.email && !isInstitutionalEmail(row.email)
            ? "E-mail deve terminar em @educacao.mg.gov.br"
            : null
        }
        onSave={async (row) => {
          const serviceIds = row.servicos_ids ?? [];
          return await saveAttendantWithServices(row, serviceIds);
        }}
        onChanged={reload}
      />
    </Section>
  );
}

function HorariosTab() {
  const { selectedSectorId } = useSector();
  const horarios = useResource(
    () => getSchedulesBySector(selectedSectorId ? [selectedSectorId] : []),
    [selectedSectorId],
  );
  const atendentes = useResource(
    () => getAttendantsBySector(selectedSectorId ? [selectedSectorId] : []),
    [selectedSectorId],
  );
  const servicos = useResource(
    () => getServicesBySector(selectedSectorId ? [selectedSectorId] : []),
    [selectedSectorId],
  );
  const TIPOS = [
    { value: "trabalho", label: "Trabalho" },
    { value: "almoco", label: "Almoço" },
    { value: "pausa", label: "Pausa" },
    { value: "bloqueio", label: "Bloqueio" },
  ];
  const fields: FieldDef[] = [
    { name: "dia_semana", label: "Dia da semana", type: "select", required: true, options: DIAS },
    {
      name: "atendente_id",
      label: "Atendente",
      type: "select",
      options: atendentes.data.map((a: any) => ({ value: a.id, label: a.nome })),
    },
    {
      name: "servico_id",
      label: "Serviço",
      type: "select",
      options: servicos.data.map((s: any) => ({ value: s.id, label: s.nome })),
    },
    {
      name: "tipo_janela",
      label: "Tipo de janela",
      type: "select",
      required: true,
      options: TIPOS,
      defaultValue: "trabalho",
    },
    { name: "hora_inicio", label: "Hora início", type: "time", required: true },
    { name: "hora_fim", label: "Hora fim", type: "time", required: true },
    { name: "timezone", label: "Timezone", defaultValue: "America/Sao_Paulo" },
    { name: "ativo", label: "Ativo", type: "checkbox", defaultValue: true },
  ];
  return (
    <Section>
      <CrudTable
        title="Grade semanal de atendimento"
        table="janelas_atendimento"
        rows={horarios.data}
        columns={[
          {
            key: "dia_semana",
            label: "Dia",
            render: (r) => DIAS.find((d) => d.value === String(r.dia_semana))?.label ?? r.dia_semana,
          },
          { key: "tipo_janela", label: "Tipo" },
          { key: "hora_inicio", label: "Início → Fim", render: (r) => `${r.hora_inicio ?? "—"} → ${r.hora_fim ?? "—"}` },
          {
            key: "atendente_id",
            label: "Atendente",
            render: (r) => ((atendentes.data as any[]) || []).find((a: any) => a.id === r.atendente_id)?.nome ?? "—",
          },
        ]}
        fields={fields}
        loading={horarios.loading}
        error={horarios.error}
        baseRow={{ setor_id: selectedSectorId }}
        validate={(row) => {
          if (!row.hora_inicio || !row.hora_fim) return "Informe os horários.";
          if (row.hora_fim <= row.hora_inicio) return "Hora fim deve ser maior que hora início.";
          return null;
        }}
        onChanged={horarios.reload}
      />
    </Section>
  );
}

function ExcecoesTab() {
  const { selectedSectorId } = useSector();
  const excecoes = useResource(
    () => getExceptionsBySector(selectedSectorId ? [selectedSectorId] : []),
    [selectedSectorId],
  );
  const atendentes = useResource(
    () => getAttendantsBySector(selectedSectorId ? [selectedSectorId] : []),
    [selectedSectorId],
  );
  const servicos = useResource(
    () => getServicesBySector(selectedSectorId ? [selectedSectorId] : []),
    [selectedSectorId],
  );
  const fields: FieldDef[] = [
    { name: "data_inicio", label: "Início", type: "datetime-local", required: true },
    { name: "data_fim", label: "Fim", type: "datetime-local", required: true },
    {
      name: "tipo",
      label: "Tipo",
      type: "select",
      required: true,
      options: [
        { value: "bloqueio", label: "Bloqueio" },
        { value: "horario_extra", label: "Janela extra" },
      ],
    },
    { name: "motivo", label: "Motivo", type: "textarea" },
    {
      name: "atendente_id",
      label: "Atendente (opcional)",
      type: "select",
      options: atendentes.data.map((a: any) => ({ value: a.id, label: a.nome })),
    },
    {
      name: "servico_id",
      label: "Serviço (opcional)",
      type: "select",
      options: servicos.data.map((s: any) => ({ value: s.id, label: s.nome })),
    },
    { name: "ativo", label: "Ativo", type: "checkbox", defaultValue: true },
  ];
  return (
    <Section>
      <CrudTable
        title="Bloqueios e janelas extras"
        table="excecoes_atendimento"
        rows={excecoes.data}
        columns={[
          { key: "tipo", label: "Tipo" },
          { key: "data_inicio", label: "Início" },
          { key: "data_fim", label: "Fim" },
          { key: "motivo", label: "Motivo" },
        ]}
        fields={fields}
        loading={excecoes.loading}
        error={excecoes.error}
        baseRow={{ setor_id: selectedSectorId }}
        onChanged={excecoes.reload}
      />
    </Section>
  );
}

function CalendariosTab() {
  const { selectedSectorId } = useSector();
  const { data, error, loading, reload } = useResource(
    () => getCalendarsBySector(selectedSectorId ? [selectedSectorId] : []),
    [selectedSectorId],
  );
  const fields: FieldDef[] = [
    { name: "nome", label: "Nome do calendário", required: true },
    { name: "google_calendar_id", label: "Google Calendar ID ou e-mail" },
    {
      name: "modo_conexao",
      label: "Modo de conexão",
      type: "select",
      options: [
        { value: "shared_with_n8n", label: "Compartilhado com n8n" },
        { value: "node_oauth", label: "OAuth via backend" },
      ],
      defaultValue: "shared_with_n8n",
    },
    {
      name: "status_conexao",
      label: "Status",
      type: "select",
      options: [
        { value: "pendente", label: "Pendente" },
        { value: "conectado", label: "Conectado" },
        { value: "erro", label: "Erro" },
      ],
      defaultValue: "pendente",
    },
    { name: "observacao", label: "Observação", type: "textarea" },
    { name: "ativo", label: "Ativo", type: "checkbox", defaultValue: true },
  ];
  return (
    <Section>
      <CrudTable
        title="Calendários / e-mails dos atendentes"
        table="calendarios_setor"
        rows={data}
        columns={[
          { key: "nome", label: "Nome" },
          { key: "google_calendar_id", label: "ID / e-mail" },
          {
            key: "modo_conexao",
            label: "Conexão",
            render: (r) =>
              r.modo_conexao === "shared_with_n8n"
                ? "Compartilhado com n8n"
                : r.modo_conexao === "node_oauth"
                  ? "OAuth via backend"
                  : r.modo_conexao ?? "—",
          },
          { key: "status_conexao", label: "Status" },
        ]}
        fields={fields}
        loading={loading}
        error={error}
        baseRow={{ setor_id: selectedSectorId }}
        onChanged={reload}
      />
    </Section>
  );
}
