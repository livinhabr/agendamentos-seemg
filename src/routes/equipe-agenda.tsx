import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Calendar, Search, ChevronDown, ChevronRight } from "lucide-react";
import { PortalLayout, PageHeader, Section } from "@/components/portal/PortalLayout";
import { CrudTable, type FieldDef } from "@/components/portal/CrudTable";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSector } from "@/lib/context/SectorContext";
import { useResource } from "@/lib/hooks/useResource";
import {
  getAttendantsBySector,
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
  errorComponent: ({ error }) => {
    return (
      <div className="p-4 bg-red-100 text-red-900 border border-red-500 rounded m-4">
        <h2 className="font-bold text-lg">Erro na Página</h2>
        <p className="font-mono text-sm mt-2">{error instanceof Error ? error.message : String(error)}</p>
        <pre className="font-mono text-xs mt-4 overflow-auto">{error instanceof Error ? error.stack : ""}</pre>
      </div>
    );
  }
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
      <PageHeader title="Equipe e Agenda" description="Atendentes, horários e exceções." />
      <Tabs defaultValue="atendentes">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="atendentes">Atendentes</TabsTrigger>
          <TabsTrigger value="horarios">Horários e pausas</TabsTrigger>
          <TabsTrigger value="excecoes">Exceções</TabsTrigger>
        </TabsList>
        <TabsContent value="atendentes"><AtendentesTab /></TabsContent>
        <TabsContent value="horarios"><HorariosTab /></TabsContent>
        <TabsContent value="excecoes"><ExcecoesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Google Calendar inline actions (for table + modal) ───────────────────

function useGoogleCalendarActions(reload: () => void) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleConnect = (atendenteId: string) => {
    const returnTo = encodeURIComponent(`${window.location.origin}/equipe-agenda`);
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-google-start?atendente_id=${atendenteId}&return_to=${returnTo}`;
    window.location.href = url;
  };

  const handleDisconnect = async (atendenteId: string) => {
    if (!confirm("Tem certeza que deseja desconectar o Google Calendar deste atendente?")) return;
    setLoadingId(atendenteId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Usuário não autenticado");

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-google-disconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ atendente_id: atendenteId })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erro ao desconectar: ${errText}`);
      }

      reload();
    } catch (err: any) {
      alert(err.message || "Ocorreu um erro ao desconectar");
    } finally {
      setLoadingId(null);
    }
  };

  return { handleConnect, handleDisconnect, loadingId };
}

function GoogleCalendarCell({ row, actions }: {
  row: any;
  actions: ReturnType<typeof useGoogleCalendarActions>;
}) {
  const conn = row.google_connection;
  const isLoading = actions.loadingId === row.id;

  if (conn?.status === "connected") {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-emerald-600 font-medium text-xs">Conectado</span>
        <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">{conn.google_email}</span>
        <div className="flex gap-1 mt-0.5">
          <Button variant="outline" size="sm" onClick={() => actions.handleConnect(row.id)} disabled={isLoading} type="button" className="h-6 text-[10px] px-2">
            Reconectar
          </Button>
          <Button variant="destructive" size="sm" onClick={() => actions.handleDisconnect(row.id)} disabled={isLoading} type="button" className="h-6 text-[10px] px-2">
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Desconectar"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">
        {conn?.status === "error" ? "Erro na conexão" : "Não conectado"}
      </span>
      <Button variant="default" size="sm" onClick={() => actions.handleConnect(row.id)} disabled={isLoading} type="button" className="h-6 text-[10px] px-2 w-fit">
        Conectar
      </Button>
    </div>
  );
}

function GoogleCalendarSection({ row, onDisconnect }: { row: any; onDisconnect: () => void }) {
  const actions = useGoogleCalendarActions(onDisconnect);
  const conn = row.google_connection;

  if (!row.id) {
    return (
      <div className="mt-4 p-4 border border-border rounded-md bg-muted/20">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-foreground"><Calendar className="w-4 h-4 text-muted-foreground" /> Google Calendar</h4>
        <p className="text-xs text-muted-foreground">Salve o atendente antes de conectar a agenda.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 border border-border rounded-md bg-muted/20 space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground"><Calendar className="w-4 h-4 text-muted-foreground" /> Google Calendar do atendente</h4>

      {conn?.status === "connected" ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-600">Conectado</p>
            <p className="text-xs text-muted-foreground">{conn.google_email}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => actions.handleConnect(row.id)} disabled={actions.loadingId === row.id} type="button" className="h-8 text-xs">
              Reconectar
            </Button>
            <Button variant="destructive" size="sm" onClick={() => actions.handleDisconnect(row.id)} disabled={actions.loadingId === row.id} type="button" className="h-8 text-xs">
              {actions.loadingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Desconectar"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {conn?.status === "error" ? "Erro na conexão" : "Não conectado"}
            </p>
          </div>
          <Button variant="default" size="sm" onClick={() => actions.handleConnect(row.id)} disabled={actions.loadingId === row.id} type="button" className="h-8 text-xs">
            Conectar Google Calendar
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Hierarchical service picker with search & select all ─────────────────

function HierarchicalServicePicker({
  servicos,
  selectedIds,
  onChange,
}: {
  servicos: any[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Build hierarchy: roots (no parent) and children (with parent)
  const roots = servicos.filter((s) => !s.servico_pai_id).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const childrenMap = new Map<string, any[]>();
  servicos.forEach((s) => {
    if (s.servico_pai_id) {
      const arr = childrenMap.get(s.servico_pai_id) || [];
      arr.push(s);
      childrenMap.set(s.servico_pai_id, arr.sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0)));
    }
  });

  // Filter by search
  const lowerSearch = search.toLowerCase();
  const matchesSearch = (s: any) => !search || s.nome.toLowerCase().includes(lowerSearch);

  // Gather all selectable IDs (non-menu items, or items matching search)
  const allSelectableIds = servicos.filter((s) => s.tipo !== "menu" && matchesSearch(s)).map((s) => s.id);

  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every((id) => selectedIds.includes(id));

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleItem = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  const selectAll = () => onChange([...new Set([...selectedIds, ...allSelectableIds])]);
  const deselectAll = () => onChange(selectedIds.filter((id) => !allSelectableIds.includes(id)));

  const selectAllChildren = (parentId: string) => {
    const children = (childrenMap.get(parentId) || []).filter(matchesSearch);
    const childIds = children.map((c: any) => c.id);
    onChange([...new Set([...selectedIds, ...childIds])]);
  };

  const deselectAllChildren = (parentId: string) => {
    const children = (childrenMap.get(parentId) || []).filter(matchesSearch);
    const childIds = new Set(children.map((c: any) => c.id));
    onChange(selectedIds.filter((id) => !childIds.has(id)));
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-foreground">Serviços vinculados</span>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar serviço..."
          className="w-full rounded-md border border-input bg-background pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Global select/deselect */}
      <div className="flex gap-2">
        <button type="button" onClick={selectAll} className="text-[10px] text-primary hover:underline font-medium">
          Selecionar todos
        </button>
        <span className="text-[10px] text-muted-foreground">|</span>
        <button type="button" onClick={deselectAll} className="text-[10px] text-primary hover:underline font-medium">
          Desmarcar todos
        </button>
      </div>

      {/* Service list */}
      <div className="max-h-52 overflow-y-auto border border-input rounded-md p-2 bg-background space-y-0.5">
        {roots.length === 0 && (
          <span className="text-xs text-muted-foreground">Nenhum serviço disponível</span>
        )}
        {roots.map((root) => {
          const children = childrenMap.get(root.id) || [];
          const hasChildren = children.length > 0;
          const isMenu = root.tipo === "menu";
          const rootMatchesSearch = matchesSearch(root);
          const matchingChildren = children.filter(matchesSearch);

          // Hide if search active and neither root nor any child matches
          if (search && !rootMatchesSearch && matchingChildren.length === 0) return null;

          if (hasChildren || isMenu) {
            const expanded = expandedGroups.has(root.id) || (search.length > 0 && matchingChildren.length > 0);
            const allChildrenSelected = matchingChildren.length > 0 && matchingChildren.every((c: any) => selectedIds.includes(c.id));

            return (
              <div key={root.id}>
                {/* Parent / Group header */}
                <div className="flex items-center gap-1 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer" onClick={() => toggleGroup(root.id)}>
                  {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                  <span className="text-xs font-medium flex-1">{root.nome}</span>
                  {matchingChildren.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); allChildrenSelected ? deselectAllChildren(root.id) : selectAllChildren(root.id); }}
                      className="text-[9px] text-primary hover:underline font-medium px-1"
                    >
                      {allChildrenSelected ? "Desmarcar" : "Todos"}
                    </button>
                  )}
                </div>
                {/* Children */}
                {expanded && (
                  <div className="ml-5 space-y-0.5">
                    {matchingChildren.map((child: any) => (
                      <label key={child.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(child.id)}
                          onChange={() => toggleItem(child.id)}
                          className="h-3.5 w-3.5"
                        />
                        <span>{child.nome}</span>
                      </label>
                    ))}
                    {matchingChildren.length === 0 && (
                      <span className="text-[10px] text-muted-foreground ml-1">Nenhum subserviço encontrado</span>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // Standalone service (no children, not a menu)
          if (!rootMatchesSearch) return null;
          return (
            <label key={root.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 p-1 rounded">
              <input
                type="checkbox"
                checked={selectedIds.includes(root.id)}
                onChange={() => toggleItem(root.id)}
                className="h-3.5 w-3.5"
              />
              <span>{root.nome}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Atendentes Tab ───────────────────────────────────────────────────────

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

  const calendarActions = useGoogleCalendarActions(reload);

  const fields: FieldDef[] = [
    { name: "nome", label: "Nome", required: true },
    { name: "email", label: "E-mail institucional", type: "email", required: true, hint: "Deve ser @educacao.mg.gov.br" },
    { name: "telefone", label: "Telefone" },
    { name: "cargo", label: "Cargo" },
    { name: "ativo", label: "Ativo", type: "checkbox", defaultValue: true },
  ];

  // State to pass servicos_ids changes from the picker back to the form
  const [pickerOverride, setPickerOverride] = useState<string[] | null>(null);

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
            render: (r) => <GoogleCalendarCell row={r} actions={calendarActions} />,
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
          const serviceIds = pickerOverride ?? row.servicos_ids ?? [];
          setPickerOverride(null);
          return await saveAttendantWithServices(row, serviceIds);
        }}
        onChanged={() => { setPickerOverride(null); reload(); }}
        renderFormExtra={(row) => (
          <>
            <HierarchicalServicePicker
              servicos={servicos.data}
              selectedIds={pickerOverride ?? row.servicos_ids ?? []}
              onChange={(ids) => {
                setPickerOverride(ids);
                // Also update the row in CrudTable's state via a workaround:
                // We set pickerOverride which is read during onSave
                row.servicos_ids = ids;
              }}
            />
            <GoogleCalendarSection row={row} onDisconnect={reload} />
          </>
        )}
      />
    </Section>
  );
}

// ── Horários Tab ─────────────────────────────────────────────────────────

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

// ── Exceções Tab ─────────────────────────────────────────────────────────

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
