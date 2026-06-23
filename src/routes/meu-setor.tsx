import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PortalLayout, PageHeader, Section } from "@/components/portal/PortalLayout";
import { useSector } from "@/lib/context/SectorContext";
import { Button } from "@/components/ui/button";
import { upsertRow, getCalendarsBySector, slugify } from "@/lib/data/agenda";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/meu-setor")({
  head: () => ({ meta: [{ title: "Meu Setor — Agenda SEE-MG" }] }),
  component: () => (
    <PortalLayout>
      <MeuSetorPage />
    </PortalLayout>
  ),
});

function MeuSetorPage() {
  const { sectors, bots, selectedSectorId, selectedBotId, refresh } = useSector();
  const sector = sectors.find((s) => s.id === selectedSectorId);
  const bot = bots.find((b) => b.id === selectedBotId);

  const [calendarios, setCalendarios] = useState<any[]>([]);
  useEffect(() => {
    if (selectedSectorId) {
      getCalendarsBySector([selectedSectorId]).then((r) => setCalendarios(r.data));
    }
  }, [selectedSectorId]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Meu Setor"
        description="Dados do setor e do bot principal de atendimento."
      />
      {sector ? (
        <SectorForm key={sector.id} sector={sector} onSaved={refresh} />
      ) : (
        <Section><p className="text-sm text-muted-foreground">Selecione um setor.</p></Section>
      )}
      {bot ? (
        <BotForm key={bot.id} bot={bot} calendarios={calendarios} onSaved={refresh} />
      ) : (
        <Section>
          <p className="mb-3 text-sm text-muted-foreground">Nenhum bot configurado para este setor.</p>
          <CreateBot setorId={selectedSectorId!} onSaved={refresh} />
        </Section>
      )}
    </div>
  );
}

function SectorForm({ sector, onSaved }: { sector: any; onSaved: () => void }) {
  return (
    <EditCard
      title="Dados do setor (Metropolitana / Regional / Setor)"
      table="setores"
      row={sector}
      fields={[
        { name: "nome", label: "Nome" },
        { name: "slug", label: "Slug" },
        { name: "descricao", label: "Descrição", type: "textarea" },
        { name: "email_contato", label: "E-mail de contato", type: "email" },
      ]}
      onSaved={onSaved}
    />
  );
}

function BotForm({ bot, calendarios, onSaved }: { bot: any; calendarios: any[]; onSaved: () => void }) {
  return (
    <EditCard
      title="Bot principal"
      table="bots_agendamento"
      row={bot}
      fields={[
        { name: "nome", label: "Nome do bot" },
        { name: "slug", label: "Slug" },
        { name: "saudacao_inicial", label: "Saudação inicial", type: "textarea" },
        {
          name: "tom_de_voz",
          label: "Tom de voz",
          type: "select",
          options: [
            { value: "formal", label: "Formal" },
            { value: "neutro", label: "Neutro" },
            { value: "amistoso", label: "Amistoso" },
          ],
        },
        { name: "mensagem_fora_escopo", label: "Mensagem fora de escopo", type: "textarea" },
        { name: "instrucoes_especificas", label: "Instruções específicas", type: "textarea" },
        {
          name: "calendario_id",
          label: "Calendário/e-mail principal",
          type: "select",
          options: calendarios.map((c: any) => ({ value: c.id, label: `${c.nome} (${c.google_calendar_id ?? "—"})` })),
        },
      ]}
      onSaved={onSaved}
    />
  );
}

function CreateBot({ setorId, onSaved }: { setorId: string; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    if (!nome.trim()) return;
    setSaving(true);
    const slug = slugify(nome);
    const { error } = await upsertRow("bots_agendamento", { nome, slug, setor_id: setorId, ativo: true });
    setSaving(false);
    if (error) setErr("Não foi possível criar o bot. Verifique suas permissões.");
    else { setNome(""); onSaved(); }
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        placeholder="Nome do bot (ex.: Atendimento Metropolitana C)"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
      />
      <Button onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
        Criar bot
      </Button>
      {err && <p className="text-xs text-amber-700">{err}</p>}
    </div>
  );
}

type Field = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "email" | "select";
  options?: { value: string; label: string }[];
};

function EditCard({
  title,
  table,
  row,
  fields,
  onSaved,
}: {
  title: string;
  table: string;
  row: any;
  fields: Field[];
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, any>>({ ...row });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const isDev = import.meta.env.DEV;
  const [errDetails, setErrDetails] = useState<any>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    setErrDetails(null);
    const payload: Record<string, any> = { id: row.id };
    for (const f of fields) payload[f.name] = values[f.name] ?? null;
    const { error } = await upsertRow(table, payload);
    setSaving(false);
    if (error) {
      setMsg("Não foi possível salvar. Verifique suas permissões ou acione o suporte.");
      setErrDetails(error);
    } else {
      setMsg("Alterações salvas.");
      onSaved();
    }
  }

  return (
    <Section title={title}>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.name} className={`block space-y-1 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
            <span className="text-xs font-medium text-foreground">{f.label}</span>
            {f.type === "textarea" ? (
              <textarea
                className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
              />
            ) : f.type === "select" ? (
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
              >
                <option value="">— selecione —</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={f.type ?? "text"}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
              />
            )}
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`text-xs ${msg?.startsWith("Não") ? "text-amber-700" : "text-emerald-700"}`}>{msg}</span>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Salvar
        </Button>
      </div>
      {isDev && errDetails && (
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-[10px] text-red-700">
          {JSON.stringify(errDetails, null, 2)}
        </pre>
      )}
    </Section>
  );
}
