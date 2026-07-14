import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Calendar, Search, ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
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
  upsertRow,
  deleteRow,
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

// ── Horários Tab (agrupado por atendente) ────────────────────────────────

const DIAS_SEMANA_ORDEM = [1, 2, 3, 4, 5, 6, 0]; // Seg→Dom

const TIPOS_JANELA = [
  { value: "trabalho", label: "Trabalho" },
  { value: "almoco", label: "Almoço" },
  { value: "pausa", label: "Pausa" },
  { value: "bloqueio", label: "Bloqueio" },
];

function normalizeSearchText(value: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function HorariosTab() {
  const { selectedSectorId } = useSector();
  const setorIds = selectedSectorId ? [selectedSectorId] : [];

  const atendentes = useResource(() => getAttendantsBySector(setorIds), [selectedSectorId]);
  const horarios = useResource(() => getSchedulesBySector(setorIds), [selectedSectorId]);
  const servicos = useResource(() => getServicesBySector(setorIds), [selectedSectorId]);
  const attServicos = useResource(() => getAttendantServicesBySector(setorIds), [selectedSectorId]);

  const [searchTerm, setSearchTerm] = useState("");
  const [editing, setEditing] = useState<Record<string, any> | null>(null);

  const reloadAll = () => { horarios.reload(); atendentes.reload(); };

  // Build attendant → services map
  const attServiceNames = (attId: string) => {
    const links = (attServicos.data || []).filter((l: any) => l.atendente_id === attId);
    return links.map((l: any) => servicos.data.find((s: any) => s.id === l.servico_id)?.nome).filter(Boolean);
  };

  // Filter attendants by search
  const filteredAtendentes = (atendentes.data || []).filter((att: any) => {
    if (!searchTerm.trim()) return true;
    const q = normalizeSearchText(searchTerm);
    const searchable = [att.nome, att.email, att.cargo, ...attServiceNames(att.id)]
      .map(normalizeSearchText).join(" ");
    return searchable.includes(q);
  });

  // Group horarios by atendente
  const horariosByAtendente = (attId: string) =>
    (horarios.data || []).filter((h: any) => h.atendente_id === attId);

  // Group by dia_semana and sort
  const groupByDia = (janelasList: any[]) => {
    const map = new Map<number, any[]>();
    for (const j of janelasList) {
      const dia = Number(j.dia_semana);
      if (!map.has(dia)) map.set(dia, []);
      map.get(dia)!.push(j);
    }
    // Sort within each day by hora_inicio
    for (const arr of map.values()) {
      arr.sort((a: any, b: any) => (a.hora_inicio || "").localeCompare(b.hora_inicio || ""));
    }
    return map;
  };

  const getDiaLabel = (dia: number) => DIAS.find(d => d.value === String(dia))?.label ?? `Dia ${dia}`;

  const isLoading = atendentes.loading || horarios.loading;

  function startCreate(atendenteId: string) {
    setEditing({
      setor_id: selectedSectorId,
      atendente_id: atendenteId,
      dia_semana: "1",
      tipo_janela: "trabalho",
      hora_inicio: "09:00",
      hora_fim: "12:00",
      timezone: "America/Sao_Paulo",
      ativo: true,
    });
  }

  return (
    <Section>
      <div className="space-y-4">
        {/* Header with search */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Horários e pausas</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Pesquisar atendente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 w-56 rounded-md border border-input bg-transparent pl-8 pr-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAtendentes.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {searchTerm.trim() ? "Nenhum atendente encontrado." : "Nenhum atendente cadastrado neste setor."}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAtendentes.map((att: any) => {
              const janelas = horariosByAtendente(att.id);
              const diaMap = groupByDia(janelas);
              const serviceNames = attServiceNames(att.id);
              const conn = att.google_connection;

              return (
                <div key={att.id} className="rounded-lg border border-border bg-card overflow-hidden">
                  {/* Attendant header */}
                  <div className="border-b border-border bg-muted/30 px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">{att.nome}</h3>
                      {conn?.status === "connected" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                          <Calendar className="h-3 w-3" /> Conectado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-500 border border-gray-200">
                          <Calendar className="h-3 w-3" /> Não conectado
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {att.email && <span>{att.email}</span>}
                      {att.cargo && <span>· {att.cargo}</span>}
                    </div>
                    {serviceNames.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70">Serviços:</span>{" "}
                        {serviceNames.join(", ")}
                      </div>
                    )}
                  </div>

                  {/* Schedules by day */}
                  <div className="px-4 py-3 space-y-2">
                    {janelas.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhum horário configurado.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {DIAS_SEMANA_ORDEM.map((dia) => {
                          const daySlots = diaMap.get(dia);
                          if (!daySlots || daySlots.length === 0) return null;
                          return (
                            <div key={dia} className="flex items-start gap-2 text-xs">
                              <span className="w-16 shrink-0 font-medium text-foreground/80 pt-0.5">
                                {getDiaLabel(dia)}
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {daySlots.map((slot: any) => {
                                  const isPause = slot.tipo_janela !== "trabalho";
                                  return (
                                    <span
                                      key={slot.id}
                                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 border ${
                                        isPause
                                          ? "bg-amber-50 text-amber-700 border-amber-200"
                                          : "bg-blue-50 text-blue-700 border-blue-200"
                                      } ${!slot.ativo ? "opacity-50 line-through" : ""}`}
                                    >
                                      {slot.hora_inicio}–{slot.hora_fim}
                                      {isPause && <span className="text-[9px]">({slot.tipo_janela})</span>}
                                      <button
                                        onClick={() => setEditing({ ...slot })}
                                        className="ml-0.5 hover:text-blue-900"
                                        title="Editar"
                                      >
                                        <Pencil className="h-2.5 w-2.5" />
                                      </button>
                                      <button
                                        onClick={async () => {
                                          if (!confirm("Excluir esta janela?")) return;
                                          await deleteRow("janelas_atendimento", slot.id);
                                          reloadAll();
                                        }}
                                        className="hover:text-red-700"
                                        title="Excluir"
                                      >
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 gap-1 text-xs"
                      onClick={() => startCreate(att.id)}
                    >
                      <Plus className="h-3 w-3" /> Adicionar horário
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {editing && (
        <HorarioFormModal
          row={editing}
          atendentes={atendentes.data}
          servicos={servicos.data}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reloadAll(); }}
        />
      )}
    </Section>
  );
}

function HorarioFormModal({
  row,
  atendentes,
  servicos,
  onClose,
  onSaved,
}: {
  row: Record<string, any>;
  atendentes: any[];
  servicos: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, any>>({ ...row });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isEditing = !!values.id;

  function set(key: string, val: any) {
    setValues((p) => ({ ...p, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.hora_inicio || !values.hora_fim) {
      setErrorMsg("Informe os horários.");
      return;
    }
    if (values.hora_fim <= values.hora_inicio) {
      setErrorMsg("Hora fim deve ser maior que hora início.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);

    const toSave = { ...values };
    if (toSave.servico_id === "") toSave.servico_id = null;
    if (!toSave.timezone) toSave.timezone = "America/Sao_Paulo";

    const { error } = await upsertRow("janelas_atendimento", toSave);
    setSaving(false);
    if (error) {
      setErrorMsg(error.message ?? "Erro ao salvar.");
      return;
    }
    onSaved();
  }

  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold text-foreground">
            {isEditing ? "Editar horário" : "Novo horário"}
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4 max-h-[70vh] overflow-y-auto">

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Atendente <span className="text-destructive">*</span></span>
            <select className={inputClass} value={values.atendente_id ?? ""} onChange={(e) => set("atendente_id", e.target.value)} required>
              <option value="">Selecione...</option>
              {atendentes.map((a: any) => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Dia da semana <span className="text-destructive">*</span></span>
              <select className={inputClass} value={values.dia_semana ?? "1"} onChange={(e) => set("dia_semana", e.target.value)} required>
                {DIAS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Tipo <span className="text-destructive">*</span></span>
              <select className={inputClass} value={values.tipo_janela ?? "trabalho"} onChange={(e) => set("tipo_janela", e.target.value)} required>
                {TIPOS_JANELA.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Hora início <span className="text-destructive">*</span></span>
              <input type="time" className={inputClass} value={values.hora_inicio ?? ""} onChange={(e) => set("hora_inicio", e.target.value)} required />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Hora fim <span className="text-destructive">*</span></span>
              <input type="time" className={inputClass} value={values.hora_fim ?? ""} onChange={(e) => set("hora_fim", e.target.value)} required />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Serviço específico (opcional)</span>
            <select className={inputClass} value={values.servico_id ?? ""} onChange={(e) => set("servico_id", e.target.value || null)}>
              <option value="">Todos os serviços</option>
              {servicos.map((s: any) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!values.ativo} onChange={(e) => set("ativo", e.target.checked)} className="h-4 w-4" />
            <span className="text-xs font-medium text-foreground">Ativo</span>
          </label>

          {errorMsg && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </div>
    </div>
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
