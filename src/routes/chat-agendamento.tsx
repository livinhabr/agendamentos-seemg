import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PortalLayout, PageHeader, Section } from "@/components/portal/PortalLayout";
import { CrudTable, type FieldDef } from "@/components/portal/CrudTable";
import { useSector } from "@/lib/context/SectorContext";
import { useResource } from "@/lib/hooks/useResource";
import {
  getChatFieldsByBot,
  getFaqsByBot,
  getServicesBySector,
  getCanalWidgetByBot,
  getAgendamentosBySector,
  upsertRow,
  deleteRow,
} from "@/lib/data/agenda";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Bot as BotIcon, User, Loader2, Pencil, Trash2, Plus, FolderOpen, ChevronRight, Calendar } from "lucide-react";
import { sendChatMessage } from "@/lib/api/backend";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/chat-agendamento")({
  head: () => ({ meta: [{ title: "Chat de Agendamento — Agenda SEE-MG" }] }),
  component: () => (
    <PortalLayout>
      <ChatAgendamentoPage />
    </PortalLayout>
  ),
});

function ChatAgendamentoPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Chat de Agendamento"
        description="Configure tudo o que o seu chat oferece ao cidadão."
      />
      <Tabs defaultValue="servicos">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="agendamentos">Agendamentos</TabsTrigger>
          <TabsTrigger value="servicos">Serviços e documentos</TabsTrigger>
          <TabsTrigger value="faqs">Perguntas frequentes</TabsTrigger>
          <TabsTrigger value="campos">Campos do usuário</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="publicar">Publicação</TabsTrigger>
        </TabsList>
        <TabsContent value="agendamentos"><AgendamentosTab /></TabsContent>
        <TabsContent value="servicos"><ServicosTab /></TabsContent>
        <TabsContent value="faqs"><FaqsTab /></TabsContent>
        <TabsContent value="campos"><CamposTab /></TabsContent>
        <TabsContent value="preview"><PreviewTab /></TabsContent>
        <TabsContent value="publicar"><PublicarTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ServicosTab() {
  const { selectedSectorId } = useSector();
  const { data, error, loading, reload } = useResource(
    () => getServicesBySector(selectedSectorId ? [selectedSectorId] : []),
    [selectedSectorId],
  );
  const [editing, setEditing] = useState<Record<string, any> | null>(null);

  // Organize data hierarchically: top-level first, then children grouped under parents
  const topLevel = data.filter((s: any) => !s.servico_pai_id);
  const childrenOf = (parentId: string) =>
    data.filter((s: any) => s.servico_pai_id === parentId);

  // Build ordered rows: parent, then its children, then next parent...
  const orderedRows: any[] = [];
  for (const parent of topLevel) {
    orderedRows.push(parent);
    if (parent.tipo === "menu") {
      for (const child of childrenOf(parent.id)) {
        orderedRows.push(child);
      }
    }
  }
  // Also include any orphaned children (parent deleted or mismatched)
  const listedIds = new Set(orderedRows.map((r) => r.id));
  for (const row of data) {
    if (!listedIds.has(row.id)) orderedRows.push(row);
  }

  function startCreate(tipo: "menu" | "servico", parentId?: string) {
    setEditing({
      setor_id: selectedSectorId,
      tipo,
      servico_pai_id: parentId ?? null,
      nome: "",
      categoria: "",
      descricao_curta: "",
      descricao_para_usuario: "",
      duracao_minutos: 30,
      intervalo_slots_minutos: 30,
      antecedencia_minima_horas: 1,
      antecedencia_maxima_dias: 60,
      local_atendimento: "",
      instrucoes_confirmacao: "",
      ordem: 0,
      ativo: true,
    });
  }

  return (
    <Section>
      <div className="space-y-4">
        {/* Header with split create buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Serviços oferecidos</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => startCreate("menu")} className="gap-1">
              <FolderOpen className="h-3.5 w-3.5" /> Novo menu
            </Button>
            <Button size="sm" onClick={() => startCreate("servico")} className="gap-1">
              <Calendar className="h-3.5 w-3.5" /> Novo serviço
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-medium">Não foi possível carregar os dados.</p>
          </div>
        )}

        {/* Hierarchical table */}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Duração</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : orderedRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-xs text-muted-foreground">
                    Nenhum serviço cadastrado. Comece criando um menu ou serviço.
                  </td>
                </tr>
              ) : (
                orderedRows.map((row) => {
                  const isChild = !!row.servico_pai_id;
                  const isMenu = row.tipo === "menu";
                  const children = isMenu ? childrenOf(row.id) : [];
                  return (
                    <tr key={row.id} className={`border-t border-border ${isChild ? "bg-muted/20" : ""}`}>
                      {/* Name column with hierarchy indentation */}
                      <td className="px-3 py-2 align-top">
                        <div className={`flex items-center gap-1.5 ${isChild ? "pl-6" : ""}`}>
                          {isChild && (
                            <span className="text-xs text-muted-foreground">└─</span>
                          )}
                          {isMenu && !isChild && (
                            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                          )}
                          {!isMenu && !isChild && (
                            <Calendar className="h-3.5 w-3.5 shrink-0 text-green-600" />
                          )}
                          <span className={isChild ? "text-muted-foreground" : "font-medium"}>
                            {row.nome}
                          </span>
                          {isMenu && children.length > 0 && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              ({children.length} sub)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Type badge */}
                      <td className="px-3 py-2 align-top">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          isMenu
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-green-50 text-green-700 border border-green-200"
                        }`}>
                          {isMenu ? "Menu" : "Serviço"}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="px-3 py-2 align-top text-muted-foreground">
                        {isMenu ? "—" : `${row.duracao_minutos ?? 30} min`}
                      </td>

                      {/* Active status */}
                      <td className="px-3 py-2 align-top">
                        <span className={`text-xs ${row.ativo ? "text-green-600" : "text-red-500"}`}>
                          {row.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2 text-right align-top">
                        <div className="flex items-center justify-end gap-1">
                          {isMenu && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs text-blue-600 hover:text-blue-700"
                              onClick={() => startCreate("servico", row.id)}
                              title="Adicionar subserviço"
                            >
                              <Plus className="h-3 w-3" /> Subserviço
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const hasChildren = data.some((s: any) => s.servico_pai_id === row.id);
                              if (hasChildren) {
                                alert("Remova os subserviços antes de excluir este menu.");
                                return;
                              }
                              if (!confirm("Excluir este registro?")) return;
                              const { error } = await deleteRow("servicos_agendamento", row.id);
                              if (error) alert(error.message ?? "Erro ao excluir.");
                              reload();
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom modal */}
      {editing && (
        <ServicoFormModal
          row={editing}
          allServices={data}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
          onCreateSubservico={(parentId) => {
            setEditing(null);
            setTimeout(() => startCreate("servico", parentId), 50);
          }}
        />
      )}
    </Section>
  );
}

// ── Custom modal for services with conditional fields ────────────────────

function ServicoFormModal({
  row,
  allServices,
  onClose,
  onSaved,
  onCreateSubservico,
}: {
  row: Record<string, any>;
  allServices: any[];
  onClose: () => void;
  onSaved: () => void;
  onCreateSubservico: (parentId: string) => void;
}) {
  const [values, setValues] = useState<Record<string, any>>({ ...row });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isEditing = !!values.id;
  const isMenu = values.tipo === "menu";

  // Menu options for the "pai" select: only tipo=menu items, excluding self
  const menuOptions = allServices
    .filter((s: any) => s.tipo === "menu" && s.id !== values.id)
    .map((s: any) => ({ value: s.id, label: s.nome }));

  // Subservices of this menu (when editing a menu)
  const subservicos = isEditing && isMenu
    ? allServices.filter((s: any) => s.servico_pai_id === values.id)
    : [];

  function set(key: string, val: any) {
    setValues((p) => ({ ...p, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    const toSave = { ...values };
    // Normalize empty strings to null
    if (toSave.servico_pai_id === "") toSave.servico_pai_id = null;
    if (!toSave.tipo) toSave.tipo = "servico";
    // Menus don't need scheduling fields — clear them if menu
    if (toSave.tipo === "menu") {
      toSave.servico_pai_id = null;
    }

    const { error } = await upsertRow("servicos_agendamento", toSave);
    setSaving(false);
    if (error) {
      setErrorMsg(error.message ?? "Erro ao salvar. Verifique as permissões.");
      return;
    }
    onSaved();
  }

  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold text-foreground">
            {isEditing ? `Editar: ${row.nome}` : (isMenu ? "Novo menu" : "Novo serviço")}
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4 max-h-[70vh] overflow-y-auto">

          {/* ── Tipo selector ───────────────────────────────── */}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">
              Este item será: <span className="text-destructive">*</span>
            </span>
            <select
              className={inputClass}
              value={values.tipo ?? "servico"}
              onChange={(e) => set("tipo", e.target.value)}
              required
            >
              <option value="servico">Serviço agendável — permite agendamento</option>
              <option value="menu">Menu/assunto principal — apenas agrupa subserviços</option>
            </select>
          </label>

          {/* ── Helper text for menu ─────────────────────────── */}
          {isMenu && (
            <div className="rounded border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-700">
              <FolderOpen className="mr-1 inline-block h-3.5 w-3.5" />
              Menus não são agendáveis diretamente. Eles aparecem no chat para organizar subserviços.
            </div>
          )}

          {/* ── Nome ────────────────────────────────────────── */}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">
              {isMenu ? "Nome do menu" : "Nome do serviço"} <span className="text-destructive">*</span>
            </span>
            <input
              className={inputClass}
              value={values.nome ?? ""}
              onChange={(e) => set("nome", e.target.value)}
              required
              placeholder={isMenu ? "Ex.: Aposentadoria" : "Ex.: Aposentadoria por idade"}
            />
          </label>

          {/* ── Parent select (only for tipo = servico) ──────── */}
          {!isMenu && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">
                Este serviço pertence a algum menu?
              </span>
              <select
                className={inputClass}
                value={values.servico_pai_id ?? ""}
                onChange={(e) => set("servico_pai_id", e.target.value || null)}
              >
                <option value="">Não, aparece no menu inicial</option>
                {menuOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <span className="block text-[11px] text-muted-foreground">
                Selecione um menu para tornar este serviço um subserviço.
              </span>
            </label>
          )}

          {/* ── Categoria ───────────────────────────────────── */}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Categoria</span>
            <input
              className={inputClass}
              value={values.categoria ?? ""}
              onChange={(e) => set("categoria", e.target.value)}
            />
          </label>

          {/* ── Descrições ──────────────────────────────────── */}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Descrição curta</span>
            <textarea
              className={`${inputClass} min-h-[60px]`}
              value={values.descricao_curta ?? ""}
              onChange={(e) => set("descricao_curta", e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Descrição para o usuário</span>
            <textarea
              className={`${inputClass} min-h-[60px]`}
              value={values.descricao_para_usuario ?? ""}
              onChange={(e) => set("descricao_para_usuario", e.target.value)}
            />
          </label>

          {/* ── Scheduling fields (hidden/optional for menus) ── */}
          {!isMenu && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">Duração (minutos)</span>
                  <input
                    type="number"
                    className={inputClass}
                    value={values.duracao_minutos ?? 30}
                    onChange={(e) => set("duracao_minutos", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">Intervalo de slots (min)</span>
                  <input
                    type="number"
                    className={inputClass}
                    value={values.intervalo_slots_minutos ?? 30}
                    onChange={(e) => set("intervalo_slots_minutos", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">Antecedência mínima (h)</span>
                  <input
                    type="number"
                    className={inputClass}
                    value={values.antecedencia_minima_horas ?? 1}
                    onChange={(e) => set("antecedencia_minima_horas", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">Antecedência máxima (dias)</span>
                  <input
                    type="number"
                    className={inputClass}
                    value={values.antecedencia_maxima_dias ?? 60}
                    onChange={(e) => set("antecedencia_maxima_dias", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">Local de atendimento</span>
                <input
                  className={inputClass}
                  value={values.local_atendimento ?? ""}
                  onChange={(e) => set("local_atendimento", e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">
                  Documentos necessários / Instruções
                </span>
                <textarea
                  className={`${inputClass} min-h-[60px]`}
                  value={values.instrucoes_confirmacao ?? ""}
                  onChange={(e) => set("instrucoes_confirmacao", e.target.value)}
                />
                <span className="block text-[11px] text-muted-foreground">
                  Liste os documentos e orientações que o usuário deve trazer.
                </span>
              </label>
            </>
          )}

          {/* ── Order & Active ─────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Ordem</span>
              <input
                type="number"
                className={inputClass}
                value={values.ordem ?? 0}
                onChange={(e) => set("ordem", e.target.value === "" ? null : Number(e.target.value))}
              />
            </label>
            <label className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                checked={!!values.ativo}
                onChange={(e) => set("ativo", e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-xs font-medium text-foreground">Ativo</span>
            </label>
          </div>

          {/* ── Subservices section (when editing a menu) ──── */}
          {isEditing && isMenu && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-foreground">
                  Subserviços deste menu ({subservicos.length})
                </h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs"
                  onClick={() => onCreateSubservico(values.id)}
                >
                  <Plus className="h-3 w-3" /> Adicionar subserviço
                </Button>
              </div>
              {subservicos.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nenhum subserviço vinculado. Clique em "Adicionar subserviço" para criar.
                </p>
              ) : (
                <ul className="space-y-1">
                  {subservicos.map((sub: any) => (
                    <li key={sub.id} className="flex items-center justify-between rounded bg-background px-2.5 py-1.5 text-xs border border-border">
                      <span className="flex items-center gap-1.5">
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        {sub.nome}
                      </span>
                      <span className={`text-[10px] ${sub.ativo ? "text-green-600" : "text-red-500"}`}>
                        {sub.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Error ───────────────────────────────────────── */}
          {errorMsg && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {errorMsg}
            </div>
          )}

          {/* ── Actions ────────────────────────────────────── */}
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

function FaqsTab() {
  const { selectedBotId } = useSector();
  const { data, error, loading, reload } = useResource(
    () => getFaqsByBot(selectedBotId ? [selectedBotId] : []),
    [selectedBotId],
  );
  const fields: FieldDef[] = [
    { name: "categoria", label: "Categoria" },
    { name: "pergunta", label: "Pergunta", required: true },
    { name: "resposta", label: "Resposta", type: "textarea", required: true },
    { name: "palavras_chave", label: "Palavras-chave (separadas por vírgula)" },
    { name: "ordem", label: "Ordem", type: "number", defaultValue: 0 },
    { name: "ativo", label: "Ativo", type: "checkbox", defaultValue: true },
  ];
  return (
    <Section>
      <CrudTable
        title="Perguntas e respostas"
        table="perguntas_respostas"
        rows={data}
        columns={[
          { key: "categoria", label: "Categoria" },
          { key: "pergunta", label: "Pergunta" },
        ]}
        fields={fields}
        loading={loading}
        error={error}
        baseRow={{ bot_id: selectedBotId }}
        onChanged={reload}
        emptyText="Selecione um bot e cadastre as primeiras perguntas."
      />
    </Section>
  );
}

function CamposTab() {
  const { selectedBotId } = useSector();
  const { data, error, loading, reload } = useResource(
    () => getChatFieldsByBot(selectedBotId ? [selectedBotId] : []),
    [selectedBotId],
  );
  const fields: FieldDef[] = [
    { name: "nome_campo", label: "Nome (chave)", required: true, hint: "Sem espaços. Ex.: nome_completo" },
    { name: "rotulo", label: "Rótulo exibido", required: true },
    {
      name: "tipo_campo",
      label: "Tipo",
      type: "select",
      required: true,
      options: [
        { value: "texto", label: "Texto" },
        { value: "email", label: "E-mail" },
        { value: "telefone", label: "Telefone" },
        { value: "cpf", label: "CPF" },
        { value: "select", label: "Lista de opções" },
        { value: "textarea", label: "Texto longo" },
        { value: "numero", label: "Número" },
        { value: "data", label: "Data" },
      ],
    },
    { name: "obrigatorio", label: "Obrigatório", type: "checkbox", defaultValue: true },
    {
      name: "opcoes_text",
      label: "Opções (uma por linha, só para 'Lista de opções')",
      type: "textarea",
    },
    { name: "ordem", label: "Ordem", type: "number", defaultValue: 0 },
    { name: "ativo", label: "Ativo", type: "checkbox", defaultValue: true },
  ];
  return (
    <Section>
      <CrudTable
        title="Campos perguntados pelo chat"
        table="campos_formulario_chat"
        rows={data.map((r: any) => ({
          ...r,
          opcoes_text: Array.isArray(r.opcoes_json) ? r.opcoes_json.join("\n") : "",
        }))}
        columns={[
          { key: "ordem", label: "#" },
          { key: "rotulo", label: "Rótulo" },
          { key: "tipo_campo", label: "Tipo" },
          { key: "obrigatorio", label: "Obrig.", render: (r) => (r.obrigatorio ? "Sim" : "Não") },
        ]}
        fields={fields}
        loading={loading}
        error={error}
        baseRow={{ bot_id: selectedBotId }}
        validate={(row) => {
          const text = (row.opcoes_text ?? "").toString();
          const arr = text.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
          row.opcoes_json = arr;
          delete row.opcoes_text;
          return null;
        }}
        onChanged={reload}
      />
    </Section>
  );
}

type Msg = { role: "bot" | "user"; text: string };
function PreviewTab() {
  const { selectedSectorId, selectedBotId, sectors, bots } = useSector();
  const sector = sectors.find((s) => s.id === selectedSectorId);
  const bot = bots.find((b) => b.id === selectedBotId);
  const [canal, setCanal] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [sessionUser, setSessionUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSessionUser(data.user));
  }, []);

  useEffect(() => {
    if (!selectedSectorId || !selectedBotId) return;
    
    getCanalWidgetByBot([selectedBotId]).then((res) => {
      const activeCanal = res.data?.find((c: any) => c.ativo);
      setCanal(activeCanal);
      setMsgs([{ role: "bot", text: bot?.saudacao_inicial ?? "Olá! Como posso ajudar com seu agendamento hoje?" }]);
    });
  }, [selectedBotId, selectedSectorId, bot?.saudacao_inicial]);

  async function send() {
    if (!input.trim() || !sector || !bot || !canal || loading) return;
    const userMsg = input.trim();
    setInput("");
    setErrorMsg("");
    setMsgs((m) => [...m, { role: "user", text: userMsg }]);
    setLoading(true);

    let sessionId = localStorage.getItem("agenda_preview_session_id");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem("agenda_preview_session_id", sessionId);
    }

    try {
      const payload = {
        setor_slug: sector.slug,
        bot_slug: bot.slug,
        canal_id: canal.id,
        session_id: sessionId,
        message: userMsg,
        user: sessionUser ? {
          name: sessionUser.user_metadata?.full_name ?? sessionUser.email?.split("@")[0],
          email: sessionUser.email
        } : undefined
      };

      const result = await sendChatMessage(payload);
      setMsgs((m) => [...m, { role: "bot", text: result.reply }]);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro desconhecido ao enviar mensagem.");
    } finally {
      setLoading(false);
    }
  }

  if (!canal) {
    return (
      <Section title="Simulação do chat (somente local)">
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Configure ou publique um canal de widget antes de testar o chat.
        </div>
      </Section>
    );
  }

  return (
    <Section title="Simulação do chat (somente local)">
      <div className="flex h-[55vh] flex-col rounded border border-border bg-background">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {msgs.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted">
                {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <BotIcon className="h-3.5 w-3.5" />}
              </div>
              <div className={`max-w-[80%] whitespace-pre-line rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted">
                <BotIcon className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-2 max-w-[80%] whitespace-pre-line rounded-lg px-3 py-2 text-sm bg-muted text-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...
              </div>
            </div>
          )}
          {errorMsg && (
            <div className="text-center text-xs text-destructive mt-2">{errorMsg}</div>
          )}
        </div>
        <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite uma mensagem..."
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()}>Enviar</Button>
        </form>
      </div>
    </Section>
  );
}

function PublicarTab() {
  const { sectors, bots, selectedSectorId, selectedBotId } = useSector();
  const sector = sectors.find((s) => s.id === selectedSectorId);
  const bot = bots.find((b) => b.id === selectedBotId);
  const [titulo, setTitulo] = useState(`Atendimento ${sector?.nome ?? ""}`);
  const [endpoint, setEndpoint] = useState("https://SEU_BACKEND/widget.js");
  const snippet = `<script src="${endpoint}" data-setor-slug="${sector?.slug ?? ""}" data-bot-slug="${bot?.slug ?? ""}" data-title="${titulo.replace(/"/g, "&quot;")}" async></script>`;
  return (
    <div className="space-y-4">
      <Section>
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          A conexão real do widget será habilitada após integração com o backend.
        </div>
      </Section>
      <Section title="Configuração do widget">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium">Endpoint do widget.js</span>
            <input className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Título</span>
            <input className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </label>
        </div>
      </Section>
      <Section title="Snippet de incorporação">
        <pre className="overflow-x-auto rounded bg-muted p-3 text-[11px]">{snippet}</pre>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => navigator.clipboard.writeText(snippet)}>Copiar snippet</Button>
        </div>
      </Section>
    </div>
  );
}

function AgendamentosTab() {
  const { selectedSectorId } = useSector();
  const { data, error, loading } = useResource(
    () => getAgendamentosBySector(selectedSectorId ? [selectedSectorId] : []),
    [selectedSectorId],
  );
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredData = data.filter((row: any) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmado":
        return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Confirmado</span>;
      case "pendente_google_calendar":
        return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Pendente Google</span>;
      case "confirmado_localmente":
        return <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Confirmado Local</span>;
      case "erro_google_calendar":
        return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Erro Google</span>;
      case "conflito_horario":
        return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Conflito</span>;
      default:
        return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">{status}</span>;
    }
  };

  const formatDate = (isoStr: string) => {
    if (!isoStr) return "-";
    const d = new Date(isoStr);
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  };

  return (
    <Section>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Acompanhamento de Agendamentos</h2>
          <div className="flex gap-2">
            <select
              className="h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos os status</option>
              <option value="confirmado">Confirmado</option>
              <option value="pendente_google_calendar">Pendente Google</option>
              <option value="erro_google_calendar">Erro Google</option>
              <option value="confirmado_localmente">Confirmado Localmente</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-medium">Não foi possível carregar os agendamentos. {error.message}</p>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Data/Hora</th>
                <th className="px-3 py-2 font-medium">Usuário</th>
                <th className="px-3 py-2 font-medium">Serviço / Atendente</th>
                <th className="px-3 py-2 font-medium">Calendário</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-xs text-muted-foreground">
                    Nenhum agendamento encontrado para este setor.
                  </td>
                </tr>
              ) : (
                filteredData.map((row: any) => (
                  <tr key={row.id} className="border-t border-border hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="font-medium">{formatDate(row.inicio)}</div>
                      <div className="text-xs text-muted-foreground">até {formatDate(row.fim)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.nome_usuario || "Anônimo"}</div>
                      <div className="text-xs text-muted-foreground">{row.email_usuario || "-"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.servico?.nome || "Serviço Desconhecido"}</div>
                      <div className="text-xs text-muted-foreground">{row.atendente?.nome || "-"}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {row.calendario?.nome || "-"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        {getStatusBadge(row.status)}
                        {row.google_event_id && (
                          <span className="text-[10px] text-muted-foreground" title={row.google_event_id}>
                            Google Event OK
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}
