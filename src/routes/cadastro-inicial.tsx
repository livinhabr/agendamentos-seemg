import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/cadastro-inicial")({
  head: () => ({ meta: [{ title: "Cadastro inicial do setor" }] }),
  component: CadastroInicial,
});

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ORG_SLUG = "see-mg";
const ORG_NOME = "Secretaria de Estado de Educação de Minas Gerais";

function CadastroInicial() {
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  const [nomeGestor, setNomeGestor] = useState("");
  const [nomeSetor, setNomeSetor] = useState("");
  const [slugSetor, setSlugSetor] = useState("");
  const [slugSetorTouched, setSlugSetorTouched] = useState(false);
  const [emailSetor, setEmailSetor] = useState("");
  const [nomeBot, setNomeBot] = useState("");
  const [slugBot, setSlugBot] = useState("");
  const [slugBotTouched, setSlugBotTouched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewJson, setPreviewJson] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) {
        navigate({ to: "/" });
        return;
      }
      const u = session.user;
      setUserId(u.id);
      setUserEmail(u.email ?? "");
      setNomeGestor(
        (u.user_metadata?.full_name as string | undefined) ?? u.email ?? "",
      );
      setChecking(false);
    });
  }, [navigate]);

  const autoSlugSetor = useMemo(() => slugify(nomeSetor), [nomeSetor]);
  const autoSlugBot = useMemo(() => slugify(nomeBot), [nomeBot]);
  useEffect(() => {
    if (!slugSetorTouched) setSlugSetor(autoSlugSetor);
  }, [autoSlugSetor, slugSetorTouched]);
  useEffect(() => {
    if (!slugBotTouched) setSlugBot(autoSlugBot);
  }, [autoSlugBot, slugBotTouched]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setErrorMsg(null);
    setPreviewJson(null);

    if (!userEmail.endsWith("@educacao.mg.gov.br")) {
      setErrorMsg("Acesso permitido apenas para contas @educacao.mg.gov.br.");
      return;
    }
    if (!nomeSetor.trim() || !slugSetor.trim() || !nomeBot.trim() || !slugBot.trim()) {
      setErrorMsg("Preencha todos os campos obrigatórios.");
      return;
    }

    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);

    const payload = {
      perfis_usuario: {
        user_id: userId,
        nome: nomeGestor,
        email: userEmail,
      },
      organizacoes: {
        slug: ORG_SLUG,
        nome: ORG_NOME,
      },
      setores: {
        organizacao_slug: ORG_SLUG,
        slug: slugSetor,
        nome: nomeSetor,
        email_contato: emailSetor || null,
      },
      gestores_setor: {
        user_id: userId,
        setor_slug: slugSetor,
        papel: "gestor",
        ativo: true,
      },
      bots_agendamento: {
        setor_slug: slugSetor,
        slug: slugBot,
        nome: nomeBot,
      },
      canais_widget: {
        bot_slug: slugBot,
        tipo: "web",
        ativo: true,
      },
    };

    setPreviewJson(JSON.stringify(payload, null, 2));
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Cadastro inicial do setor
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure seu setor (Metropolitana, Regional ou unidade) para começar a usar a Agenda Setorial.
          </p>
          <p className="mt-1 text-xs text-amber-600">
            Modo de teste — os dados abaixo serão exibidos em JSON para validação, sem gravação no banco.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
          <Field label="Nome completo do gestor">
            <input
              className="input"
              value={nomeGestor}
              onChange={(e) => setNomeGestor(e.target.value)}
              required
            />
          </Field>

          <Field label="E-mail institucional">
            <input className="input" value={userEmail} readOnly />
          </Field>

          <Field label="Nome da Metropolitana/Regional/Setor" hint="ex.: Metropolitana C">
            <input
              className="input"
              value={nomeSetor}
              onChange={(e) => setNomeSetor(e.target.value)}
              required
            />
          </Field>

          <Field label="Slug da Metropolitana/Regional/Setor" hint="ex.: metropolitana-c">
            <input
              className="input"
              value={slugSetor}
              onChange={(e) => {
                setSlugSetorTouched(true);
                setSlugSetor(slugify(e.target.value));
              }}
              required
            />
          </Field>

          <Field label="E-mail de contato do setor">
            <input
              className="input"
              type="email"
              value={emailSetor}
              onChange={(e) => setEmailSetor(e.target.value)}
              placeholder="ex.: metropolitana.c@educacao.mg.gov.br"
            />
          </Field>

          <Field label="Nome do bot de atendimento" hint="ex.: Atendimento Metropolitana C">
            <input
              className="input"
              value={nomeBot}
              onChange={(e) => setNomeBot(e.target.value)}
              required
            />
          </Field>

          <Field label="Slug do bot" hint="ex.: atendimento-metropolitana-c">
            <input
              className="input"
              value={slugBot}
              onChange={(e) => {
                setSlugBotTouched(true);
                setSlugBot(slugify(e.target.value));
              }}
              required
            />
          </Field>

          {errorMsg && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">{errorMsg}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/" }))}>
              Sair
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar e continuar
            </Button>
          </div>
        </form>

        {previewJson && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Resumo dos dados (JSON de teste)</h2>
            <pre className="max-h-96 overflow-auto rounded border border-border bg-muted p-4 text-xs">
              {previewJson}
            </pre>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewJson(null)}>
                Limpar resumo
              </Button>
              <Button variant="outline" onClick={() => navigate({ to: "/painel" })}>
                Ir para o painel
              </Button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .input {
          width: 100%;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }
        .input:focus { outline: 2px solid hsl(var(--ring)); outline-offset: 1px; }
      `}</style>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
