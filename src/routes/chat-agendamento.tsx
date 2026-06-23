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
} from "@/lib/data/agenda";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Bot as BotIcon, User } from "lucide-react";

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
  const fields: FieldDef[] = [
    { name: "nome", label: "Nome do serviço", required: true },
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
          { key: "nome", label: "Nome" },
          { key: "categoria", label: "Categoria" },
          { key: "duracao_minutos", label: "Duração" },
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
  const { selectedSectorId, selectedBotId, bots } = useSector();
  const bot = bots.find((b) => b.id === selectedBotId);
  const [servicos, setServicos] = useState<any[]>([]);
  const [faqs, setFaqs] = useState<any[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!selectedSectorId || !selectedBotId) return;
    Promise.all([
      getServicesBySector([selectedSectorId]),
      getFaqsByBot([selectedBotId]),
    ]).then(([s, f]) => {
      setServicos(s.data);
      setFaqs(f.data);
      setMsgs([{ role: "bot", text: bot?.saudacao_inicial ?? "Olá! Como posso ajudar com seu agendamento hoje?" }]);
    });
  }, [selectedBotId, selectedSectorId, bot?.saudacao_inicial]);

  function send() {
    if (!input.trim()) return;
    const lower = input.toLowerCase();
    const faq = faqs.find(
      (f) => f.pergunta?.toLowerCase().includes(lower) || (f.palavras_chave ?? "").toLowerCase().includes(lower),
    );
    let resposta = bot?.mensagem_fora_escopo ?? "Não entendi. Pode reformular?";
    if (faq) resposta = faq.resposta;
    else if (lower.includes("servic") || lower.includes("agendar")) {
      resposta = servicos.length === 0
        ? "Ainda não há serviços cadastrados."
        : "Serviços disponíveis:\n• " + servicos.map((s) => s.nome).join("\n• ");
    }
    setMsgs((m) => [...m, { role: "user", text: input }, { role: "bot", text: resposta }]);
    setInput("");
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
        </div>
        <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite uma mensagem..."
          />
          <Button type="submit">Enviar</Button>
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
