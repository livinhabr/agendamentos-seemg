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
} from "@/lib/data/agenda";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Bot as BotIcon, User, Loader2 } from "lucide-react";
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
          <TabsTrigger value="servicos">Serviços e documentos</TabsTrigger>
          <TabsTrigger value="faqs">Perguntas frequentes</TabsTrigger>
          <TabsTrigger value="campos">Campos do usuário</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="publicar">Publicação</TabsTrigger>
        </TabsList>
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

  // Build parent options: services that can act as parents (tipo = 'menu' or top-level without pai)
  const parentOptions = data
    .filter((s: any) => s.tipo === "menu" || (!s.servico_pai_id && !s.tipo))
    .map((s: any) => ({ value: s.id, label: s.nome }));

  const fields: FieldDef[] = [
    { name: "nome", label: "Nome do serviço", required: true },
    {
      name: "tipo",
      label: "Tipo",
      type: "select",
      required: true,
      options: [
        { value: "servico", label: "Serviço (agendável)" },
        { value: "menu", label: "Menu (agrupa subserviços)" },
      ],
      defaultValue: "servico",
      hint: "Menu = agrupa subserviços sem permitir agendamento direto. Serviço = permite agendamento.",
    },
    {
      name: "servico_pai_id",
      label: "Serviço principal (pai)",
      type: "select",
      options: parentOptions,
      hint: "Deixe vazio para exibir no menu inicial. Selecione um pai para tornar subserviço.",
    },
    { name: "categoria", label: "Categoria" },
    { name: "descricao_curta", label: "Descrição curta", type: "textarea" },
    { name: "descricao_para_usuario", label: "Descrição para o usuário", type: "textarea" },
    { name: "duracao_minutos", label: "Duração (minutos)", type: "number", defaultValue: 30 },
    { name: "intervalo_slots_minutos", label: "Intervalo de slots (min)", type: "number", defaultValue: 30 },
    { name: "antecedencia_minima_horas", label: "Antecedência mínima (h)", type: "number", defaultValue: 1 },
    { name: "antecedencia_maxima_dias", label: "Antecedência máxima (dias)", type: "number", defaultValue: 60 },
    { name: "local_atendimento", label: "Local de atendimento" },
    {
      name: "instrucoes_confirmacao",
      label: "Documentos necessários / Instruções",
      type: "textarea",
      hint: "Liste os documentos e orientações que o usuário deve trazer.",
    },
    { name: "ordem", label: "Ordem", type: "number", defaultValue: 0 },
    { name: "ativo", label: "Ativo", type: "checkbox", defaultValue: true },
  ];
  return (
    <Section>
      <CrudTable
        title="Serviços oferecidos"
        table="servicos_agendamento"
        rows={data}
        columns={[
          { key: "nome", label: "Nome", render: (r) => {
            const isChild = !!r.servico_pai_id;
            return (
              <span className={isChild ? "pl-4 text-muted-foreground" : "font-medium"}>
                {isChild && <span className="mr-1 text-xs">↳</span>}
                {r.nome}
              </span>
            );
          }},
          { key: "tipo", label: "Tipo", render: (r) => (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.tipo === "menu" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
              {r.tipo === "menu" ? "Menu" : "Serviço"}
            </span>
          )},
          { key: "servico_pai_id", label: "Pai", render: (r) => {
            if (!r.servico_pai_id) return "—";
            const pai = data.find((s: any) => s.id === r.servico_pai_id);
            return pai ? pai.nome : "—";
          }},
          { key: "categoria", label: "Categoria" },
          { key: "duracao_minutos", label: "Duração" },
        ]}
        fields={fields}
        loading={loading}
        error={error}
        baseRow={{ setor_id: selectedSectorId }}
        validate={(row) => {
          // Clear servico_pai_id if empty string (select returns "")
          if (row.servico_pai_id === "") row.servico_pai_id = null;
          // Default tipo if somehow empty
          if (!row.tipo) row.tipo = "servico";
          return null;
        }}
        onChanged={reload}
      />
    </Section>
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
