import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PortalLayout, PageHeader, Section } from "@/components/portal/PortalLayout";
import { useSector } from "@/lib/context/SectorContext";
import { Button } from "@/components/ui/button";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Agenda SEE-MG" }] }),
  component: () => (
    <PortalLayout>
      <ConfigPage />
    </PortalLayout>
  ),
});

function ConfigPage() {
  const navigate = useNavigate();
  const { userId, userEmail, sectors, bots, selectedSectorId, selectedBotId } = useSector();
  const sector = sectors.find((s) => s.id === selectedSectorId);
  const bot = bots.find((b) => b.id === selectedBotId);
  const isDev = import.meta.env.DEV;

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Configurações" description="Conta, contexto e importação de dados." />

      <Tabs defaultValue="conta">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="conta">Conta</TabsTrigger>
          <TabsTrigger value="importacao">Importação CSV</TabsTrigger>
          <TabsTrigger value="sheets">Google Sheets</TabsTrigger>
          {isDev && <TabsTrigger value="debug">Debug</TabsTrigger>}
        </TabsList>

        <TabsContent value="conta" className="space-y-4">
          <Section title="Usuário logado">
            <p className="text-sm"><span className="font-medium">E-mail:</span> {userEmail}</p>
            <p className="text-sm"><span className="font-medium">ID:</span> <span className="font-mono text-xs">{userId}</span></p>
          </Section>
          <Section title="Setor atual">
            <p className="text-sm"><span className="font-medium">Nome:</span> {sector?.nome ?? "—"}</p>
            <p className="text-sm"><span className="font-medium">Slug:</span> {sector?.slug ?? "—"}</p>
          </Section>
          <Section title="Bot atual">
            <p className="text-sm"><span className="font-medium">Nome:</span> {bot?.nome ?? "—"}</p>
            <p className="text-sm"><span className="font-medium">Slug:</span> {bot?.slug ?? "—"}</p>
          </Section>
          <div className="flex justify-end">
            <Button variant="destructive" onClick={signOut}>Sair</Button>
          </div>
        </TabsContent>

        <TabsContent value="importacao"><ImportacaoSection /></TabsContent>
        <TabsContent value="sheets"><SheetsSection /></TabsContent>

        {isDev && (
          <TabsContent value="debug">
            <Section title="Debug (apenas desenvolvimento)">
              <pre className="overflow-x-auto rounded bg-muted p-3 text-[11px]">
                {JSON.stringify({ SUPABASE_URL, userId, userEmail, selectedSectorId, selectedBotId, sectors: sectors.length, bots: bots.length }, null, 2)}
              </pre>
            </Section>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

const MODELOS = [
  "servicos_agendamento",
  "atendentes",
  "janelas_atendimento",
  "perguntas_respostas",
  "campos_formulario_chat",
  "calendarios_setor",
  "excecoes_atendimento",
];

function ImportacaoSection() {
  const [modelo, setModelo] = useState(MODELOS[0]);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function handleFile(file: File) {
    setErro(null); setRows(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = text.split(/\r?\n/).filter(Boolean).map((line) => line.split(/[,;]/).map((c) => c.trim()));
      if (parsed.length === 0) setErro("Arquivo vazio.");
      else setRows(parsed.slice(0, 50));
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-4">
      <Section title="Importação CSV/XLSX">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium">Modelo</span>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
            >
              {MODELOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Arquivo CSV</span>
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="block w-full text-sm"
            />
            <span className="block text-[11px] text-muted-foreground">
              XLSX completo será processado no backend em etapa posterior.
            </span>
          </label>
        </div>
      </Section>
      {erro && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{erro}</div>}
      {rows && (
        <Section title={`Prévia (${rows.length} linhas)`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>{rows[0].map((h, i) => <th key={i} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(1).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {r.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end"><Button disabled>Importar (em breve)</Button></div>
        </Section>
      )}
    </div>
  );
}

function SheetsSection() {
  const [sheetId, setSheetId] = useState("");
  const [aba, setAba] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Section title="Integração Google Sheets">
      <p className="mb-3 text-xs text-muted-foreground">Sincronização será feita via backend em etapa posterior.</p>
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">Google Sheet ID</span>
          <input className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={sheetId} onChange={(e) => setSheetId(e.target.value)} placeholder="1BxiMVs0XRA..." />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">Nome da aba</span>
          <input className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={aba} onChange={(e) => setAba(e.target.value)} placeholder="servicos" />
        </label>
        <div className="flex justify-end">
          <Button onClick={() => setMsg("Integração será conectada via backend em etapa posterior.")}>Sincronizar</Button>
        </div>
        {msg && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{msg}</p>}
      </div>
    </Section>
  );
}
