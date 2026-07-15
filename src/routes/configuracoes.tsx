import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useCallback, useEffect } from "react";
import { PortalLayout, PageHeader, Section } from "@/components/portal/PortalLayout";
import { useSector } from "@/lib/context/SectorContext";
import { Button } from "@/components/ui/button";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useResource } from "@/lib/hooks/useResource";
import {
  getKnowledgeBaseBySector,
  getServicesBySector,
  getPublicationChecklistData,
  updateBotPublicationStatus,
  upsertRow,
  deleteRow,
} from "@/lib/data/agenda";
import type { PublicationChecklist } from "@/lib/data/agenda";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Search,
  ExternalLink,
  BookOpen,
  Calendar,
  Info,
  Upload,
  FileText,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  ClipboardCheck,
  Send,
  Shield,
  AlertTriangle,
  Users,
  Bot,
  Building2,
  CalendarClock,
  FileCheck,
  MonitorPlay,
  TestTube2,
  Eye,
} from "lucide-react";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Agenda SEE-MG" }] }),
  component: () => (
    <PortalLayout>
      <ConfigPage />
    </PortalLayout>
  ),
});

/* ═══════════════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════════ */

function ConfigPage() {
  const navigate = useNavigate();
  const { userId, userEmail, sectors, bots, selectedSectorId, selectedBotId } = useSector();
  const sector = sectors.find((s) => s.id === selectedSectorId);
  const bot = bots.find((b) => b.id === selectedBotId);
  const showDebug = import.meta.env.VITE_SHOW_DEBUG === "true";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Configurações" description="Conta, base de conhecimento e revisão para publicação." />

      <Tabs defaultValue="base-agente">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="base-agente">Base do agente</TabsTrigger>
          <TabsTrigger value="conta">Conta</TabsTrigger>
          <TabsTrigger value="revisao">Revisão e publicação</TabsTrigger>
          {showDebug && <TabsTrigger value="debug">Debug</TabsTrigger>}
        </TabsList>

        <TabsContent value="base-agente">
          <BaseAgenteTab />
        </TabsContent>

        <TabsContent value="conta" className="space-y-4">
          <Section title="Usuário logado">
            <p className="text-sm"><span className="font-medium">E-mail:</span> {userEmail}</p>
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

        <TabsContent value="revisao">
          <RevisaoPublicacaoTab />
        </TabsContent>

        {showDebug && (
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

/* ═══════════════════════════════════════════════════════════════════════════
   Revisão e publicação Tab
   ═══════════════════════════════════════════════════════════════════════ */

type CheckItemStatus = "concluido" | "pendente" | "atencao";

type CheckItem = {
  label: string;
  status: CheckItemStatus;
  detail?: string;
  icon: React.ElementType;
  critical?: boolean;
};

function buildChecklist(
  cl: PublicationChecklist,
  sectorName: string | undefined,
): CheckItem[] {
  const items: CheckItem[] = [];

  // 1. Dados do setor
  items.push({
    label: "Dados do setor preenchidos",
    status: sectorName ? "concluido" : "pendente",
    detail: sectorName ? `Setor: ${sectorName}` : "Setor sem nome",
    icon: Building2,
  });

  // 2. Serviços cadastrados
  items.push({
    label: "Serviços cadastrados",
    status: cl.servicosAtivos > 0 ? "concluido" : "pendente",
    detail: cl.servicosAtivos > 0 ? `${cl.servicosAtivos} serviço(s) ativo(s)` : "Nenhum serviço ativo",
    icon: ClipboardCheck,
    critical: cl.servicosAtivos === 0,
  });

  // 3. Base do agente configurada
  items.push({
    label: "Base do agente configurada",
    status: cl.basesAtivas > 0 ? "concluido" : "pendente",
    detail: cl.basesAtivas > 0 ? `${cl.basesAtivas} base(s) ativa(s)` : "Nenhuma base configurada",
    icon: BookOpen,
    critical: cl.basesAtivas === 0,
  });

  // 4. Documentos do agente
  const allDocsOk = cl.basesAtivas > 0 && cl.docsPendentes === 0;
  const someDocsPending = cl.basesAtivas > 0 && cl.docsPendentes > 0;
  items.push({
    label: "Documentos do agente enviados/processados",
    status: allDocsOk ? "concluido" : someDocsPending ? "atencao" : "pendente",
    detail: cl.basesAtivas > 0
      ? `${cl.docsProcessados} processado(s), ${cl.docsPendentes} pendente(s)`
      : "Nenhum documento cadastrado",
    icon: FileCheck,
  });

  // 5. Atendentes
  items.push({
    label: "Atendentes cadastrados",
    status: cl.atendentesAtivos > 0 ? "concluido" : "pendente",
    detail: cl.atendentesAtivos > 0
      ? `${cl.atendentesAtivos} atendente(s) ativo(s)`
      : "Nenhum atendente ativo",
    icon: Users,
    critical: cl.atendentesAtivos === 0,
  });

  // 6. Google Calendar
  const allHaveGoogle = cl.atendentesAtivos > 0 && cl.atendentesComGoogle === cl.atendentesAtivos;
  const someHaveGoogle = cl.atendentesAtivos > 0 && cl.atendentesComGoogle > 0 && cl.atendentesComGoogle < cl.atendentesAtivos;
  items.push({
    label: "Google Calendar conectado aos atendentes",
    status: allHaveGoogle ? "concluido" : someHaveGoogle ? "atencao" : "pendente",
    detail: cl.atendentesAtivos > 0
      ? `${cl.atendentesComGoogle} de ${cl.atendentesAtivos} conectado(s)`
      : "Nenhum atendente para conectar",
    icon: Calendar,
  });

  // 7. Horários e pausas
  items.push({
    label: "Horários e pausas configurados",
    status: cl.horariosAtivos > 0 ? "concluido" : "pendente",
    detail: cl.horariosAtivos > 0
      ? `${cl.horariosAtivos} janela(s) de atendimento`
      : "Nenhum horário configurado",
    icon: CalendarClock,
    critical: cl.horariosAtivos === 0,
  });

  // 8. Exceções
  items.push({
    label: "Exceções cadastradas, se houver",
    status: "concluido",
    detail: cl.excecoesCount > 0
      ? `${cl.excecoesCount} exceção(ões) cadastrada(s)`
      : "Nenhuma exceção (opcional)",
    icon: AlertTriangle,
  });

  // 9–11. Manual items
  items.push({
    label: "Preview do chat testado",
    status: "pendente",
    detail: "Verificação manual",
    icon: MonitorPlay,
  });

  items.push({
    label: "Agendamentos testados",
    status: "pendente",
    detail: "Verificação manual",
    icon: TestTube2,
  });

  items.push({
    label: "Publicação revisada",
    status: "pendente",
    detail: "Verificação manual",
    icon: Eye,
  });

  return items;
}

function getOverallStatus(cl: PublicationChecklist): {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
} {
  if (cl.statusPublicacao === "publicado")
    return { label: "Publicado", color: "text-emerald-700", bgColor: "bg-emerald-50", borderColor: "border-emerald-200" };
  if (cl.statusPublicacao === "aprovado")
    return { label: "Aprovado", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200" };
  if (cl.statusPublicacao === "em_revisao")
    return { label: "Em revisão", color: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200" };

  const hasCritical =
    cl.servicosAtivos === 0 ||
    cl.basesAtivas === 0 ||
    cl.atendentesAtivos === 0 ||
    cl.horariosAtivos === 0 ||
    !cl.botAtivo;

  if (hasCritical)
    return { label: "Em configuração", color: "text-gray-700", bgColor: "bg-gray-50", borderColor: "border-gray-200" };
  return { label: "Pronto para revisão", color: "text-emerald-700", bgColor: "bg-emerald-50", borderColor: "border-emerald-200" };
}

function getCriticalPendencies(cl: PublicationChecklist): string[] {
  const p: string[] = [];
  if (cl.servicosAtivos === 0) p.push("Nenhum serviço ativo");
  if (cl.basesAtivas === 0) p.push("Nenhuma base do agente configurada");
  if (cl.atendentesAtivos === 0) p.push("Nenhum atendente ativo");
  if (cl.horariosAtivos === 0) p.push("Nenhum horário configurado");
  if (!cl.botAtivo) p.push("Bot inativo");
  return p;
}

const statusConfig = {
  concluido: {
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    label: "Concluído",
  },
  pendente: {
    icon: Clock,
    color: "text-gray-500",
    bg: "bg-gray-50",
    border: "border-gray-200",
    label: "Pendente",
  },
  atencao: {
    icon: AlertCircle,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    label: "Atenção",
  },
} as const;

function RevisaoPublicacaoTab() {
  const { userId, sectors, bots, selectedSectorId, selectedBotId } = useSector();
  const sector = sectors.find((s) => s.id === selectedSectorId);
  const bot = bots.find((b) => b.id === selectedBotId);
  const setorIds = selectedSectorId ? [selectedSectorId] : [];

  const [checklist, setChecklist] = useState<PublicationChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadChecklist = useCallback(async () => {
    setLoading(true);
    const { data } = await getPublicationChecklistData(setorIds, selectedBotId);
    setChecklist(data);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectorId, selectedBotId]);

  useEffect(() => {
    void loadChecklist();
  }, [loadChecklist]);

  if (loading || !checklist) {
    return (
      <Section>
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </Section>
    );
  }

  const items = buildChecklist(checklist, sector?.nome);
  const overallStatus = getOverallStatus(checklist);
  const criticalPendencies = getCriticalPendencies(checklist);
  const canSubmit = criticalPendencies.length === 0 && checklist.statusPublicacao === "rascunho";
  const alreadySubmitted = checklist.statusPublicacao !== "rascunho";

  const completedCount = items.filter((i) => i.status === "concluido").length;
  const progressPct = Math.round((completedCount / items.length) * 100);

  async function handleSubmit() {
    if (!selectedBotId || !userId) return;
    setSubmitting(true);
    const { error } = await updateBotPublicationStatus(selectedBotId, userId);
    setSubmitting(false);
    setShowConfirmModal(false);
    if (error) {
      alert("Erro ao enviar para publicação: " + error.message);
      return;
    }
    setSuccessMessage(
      "Solicitação de publicação registrada. Após a revisão técnica, o chat poderá ser disponibilizado ao público.",
    );
    void loadChecklist();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Section>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Revisão e publicação
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Confira se todas as informações do chat de agendamento foram preenchidas antes de enviar para publicação.
          </p>
        </div>
      </Section>

      {/* Success Message */}
      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Summary */}
      <Section title="Resumo do chat">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-border p-3 text-center">
              <Building2 className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-[10px] uppercase text-muted-foreground">Setor</p>
              <p className="text-sm font-medium truncate">{sector?.nome ?? "—"}</p>
            </div>
            <div className="rounded-md border border-border p-3 text-center">
              <Bot className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-[10px] uppercase text-muted-foreground">Bot</p>
              <p className="text-sm font-medium truncate">{bot?.nome ?? "—"}</p>
            </div>
            <div className="rounded-md border border-border p-3 text-center">
              <ClipboardCheck className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-[10px] uppercase text-muted-foreground">Serviços ativos</p>
              <p className="text-lg font-bold">{checklist.servicosAtivos}</p>
            </div>
            <div className="rounded-md border border-border p-3 text-center">
              <Users className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-[10px] uppercase text-muted-foreground">Atendentes ativos</p>
              <p className="text-lg font-bold">{checklist.atendentesAtivos}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border p-3 text-center">
              <BookOpen className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-[10px] uppercase text-muted-foreground">Bases do agente</p>
              <p className="text-lg font-bold">{checklist.basesAtivas}</p>
            </div>
            <div className="rounded-md border border-border p-3 text-center">
              <FileText className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-[10px] uppercase text-muted-foreground">Docs processados</p>
              <p className="text-lg font-bold">{checklist.docsProcessados}</p>
            </div>
            <div className="col-span-2 sm:col-span-1 rounded-md border p-3 text-center ${overallStatus.borderColor}">
              <Shield className={`mx-auto h-4 w-4 mb-1 ${overallStatus.color}`} />
              <p className="text-[10px] uppercase text-muted-foreground">Status geral</p>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${overallStatus.color} ${overallStatus.bgColor} border ${overallStatus.borderColor}`}>
                {overallStatus.label}
              </span>
            </div>
          </div>
        </div>
      </Section>

      {/* Progress */}
      <Section>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progresso do checklist</span>
            <span className="font-medium">{completedCount} de {items.length} itens concluídos ({progressPct}%)</span>
          </div>
          <Progress value={progressPct} />
        </div>
      </Section>

      {/* Checklist */}
      <Section title="Checklist de prontidão">
        <div className="space-y-1.5">
          {items.map((item) => {
            const cfg = statusConfig[item.status];
            const StatusIcon = cfg.icon;
            const ItemIcon = item.icon;
            return (
              <div
                key={item.label}
                className={`flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors ${cfg.border} ${cfg.bg}`}
              >
                <ItemIcon className={`h-4 w-4 flex-shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  {item.detail && (
                    <p className="text-[11px] text-muted-foreground truncate">{item.detail}</p>
                  )}
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
                  <StatusIcon className="h-2.5 w-2.5" />
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Pendencies warning */}
      {criticalPendencies.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">
                Antes de enviar para publicação, conclua os seguintes itens:
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {criticalPendencies.map((p) => (
                  <li key={p} className="text-xs text-red-700 flex items-center gap-1">
                    <span className="h-1 w-1 rounded-full bg-red-400 flex-shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Submit button */}
      <div className="flex justify-end">
        {alreadySubmitted ? (
          <div className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${overallStatus.color} ${overallStatus.bgColor} border ${overallStatus.borderColor}`}>
            <Shield className="h-4 w-4" />
            {overallStatus.label}
            {checklist.dataEnvioPublicacao && (
              <span className="text-[10px] text-muted-foreground ml-1">
                — Enviado em {new Date(checklist.dataEnvioPublicacao).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        ) : (
          <Button
            size="lg"
            disabled={!canSubmit}
            onClick={() => setShowConfirmModal(true)}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            Enviar para publicação
          </Button>
        )}
      </div>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envio para publicação</DialogTitle>
            <DialogDescription>
              Ao confirmar, o chat de agendamento será enviado para revisão técnica.
              Após a aprovação, ele poderá ser disponibilizado ao público.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Certifique-se de que o chat foi testado antes de enviar.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirmar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

function norm(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Build full service name with parent prefix */
function servicoFullName(svc: any, allServicos: any[]): string {
  if (!svc) return "";
  if (svc.servico_pai_id) {
    const parent = allServicos.find((p: any) => p.id === svc.servico_pai_id);
    if (parent) return `${parent.nome} › ${svc.nome}`;
  }
  return svc.nome;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Base do Agente Tab
   ═══════════════════════════════════════════════════════════════════════ */

function BaseAgenteTab() {
  const { selectedSectorId, selectedBotId } = useSector();
  const setorIds = selectedSectorId ? [selectedSectorId] : [];

  const kb = useResource(
    () => getKnowledgeBaseBySector(setorIds),
    [selectedSectorId],
  );
  const servicos = useResource(
    () => getServicesBySector(setorIds),
    [selectedSectorId],
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [editing, setEditing] = useState<Record<string, any> | null>(null);

  // Filter rows by search (service name)
  const filteredRows = (kb.data || []).filter((row: any) => {
    if (!searchTerm.trim()) return true;
    const q = norm(searchTerm);
    const svc = servicos.data.find((s: any) => s.id === row.servico_id);
    const searchable = norm(servicoFullName(svc, servicos.data));
    return searchable.includes(q);
  });

  function startCreate() {
    setEditing({
      setor_id: selectedSectorId,
      bot_id: selectedBotId,
      servico_id: null,
      agendavel: false,
      link_acesso: "",
      instrucoes_agente: "",
      documento_nome: null,
      documento_path: null,
      documento_url: null,
      documento_texto_extraido: "",
      documento_status: "pendente",
      ativo: true,
    });
  }

  function handleEdit(row: any) {
    setEditing({ ...row });
  }

  /** If service already has active config, open it for editing instead of creating duplicate */
  function handleEditOrCreateForService(servicoId: string) {
    const existing = (kb.data || []).find(
      (r: any) => r.servico_id === servicoId && r.ativo,
    );
    if (existing) {
      setEditing({ ...existing });
    } else {
      setEditing({
        setor_id: selectedSectorId,
        bot_id: selectedBotId,
        servico_id: servicoId,
        agendavel: false,
        link_acesso: "",
        instrucoes_agente: "",
        documento_nome: null,
        documento_path: null,
        documento_url: null,
        documento_texto_extraido: "",
        documento_status: "pendente",
        ativo: true,
      });
    }
  }

  return (
    <Section>
      <div className="space-y-4">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Base de conhecimento do agente
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure cada serviço com documento oficial, link e regras. O agente
            usará o conteúdo do documento como fonte para responder o usuário.
          </p>
        </div>

        {/* Search + New */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Pesquisar serviço..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 w-72 rounded-md border border-input bg-transparent pl-8 pr-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <Button size="sm" onClick={startCreate} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Configurar serviço
          </Button>
        </div>

        {/* Table */}
        {kb.loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : kb.error ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Não foi possível carregar a base de conhecimento.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Serviço</th>
                  <th className="px-3 py-2 font-medium text-center">Agendável</th>
                  <th className="px-3 py-2 font-medium">Documento</th>
                  <th className="px-3 py-2 font-medium">Link</th>
                  <th className="px-3 py-2 font-medium text-center">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">
                      {searchTerm.trim()
                        ? "Nenhuma configuração encontrada para esta pesquisa."
                        : 'Nenhum serviço configurado. Clique em "+ Configurar serviço" para começar.'}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row: any) => {
                    const svc = servicos.data.find((s: any) => s.id === row.servico_id);
                    return (
                      <tr key={row.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 font-medium text-sm">
                          {svc ? servicoFullName(svc, servicos.data) : <span className="italic text-muted-foreground">Serviço removido</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.agendavel ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                              <Calendar className="h-2.5 w-2.5" /> Sim
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-500 border border-gray-200">
                              <Info className="h-2.5 w-2.5" /> Não
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.documento_nome ? (
                            <div className="flex items-center gap-1">
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate max-w-[120px]">{row.documento_nome}</span>
                              <DocumentStatusBadge status={row.documento_status} />
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.link_acesso ? (
                            <a href={row.link_acesso} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-primary hover:underline">
                              <ExternalLink className="h-3 w-3" /> Link
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.ativo ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">Ativo</span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600 border border-red-200">Inativo</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(row)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={async () => {
                              if (!confirm("Excluir esta configuração?")) return;
                              await deleteRow("base_conhecimento_agente", row.id);
                              kb.reload();
                            }}>
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
        )}
      </div>

      {/* Modal */}
      {editing && (
        <ServiceKBModal
          row={editing}
          servicos={servicos.data}
          allKbRows={kb.data || []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            kb.reload();
          }}
        />
      )}
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Document Status Badge
   ═══════════════════════════════════════════════════════════════════════ */

function DocumentStatusBadge({ status }: { status: string | null }) {
  if (status === "processado") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600 border border-emerald-200">
        <CheckCircle2 className="h-2 w-2" /> OK
      </span>
    );
  }
  if (status === "erro") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-medium text-red-600 border border-red-200">
        <AlertCircle className="h-2 w-2" /> Erro
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 border border-amber-200">
      <Clock className="h-2 w-2" /> Pendente
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Hierarchical Service Picker (single-select with search)
   ═══════════════════════════════════════════════════════════════════════ */

function SingleServicePicker({
  servicos,
  selectedId,
  onChange,
  disabled,
}: {
  servicos: any[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const roots = servicos.filter((s) => !s.servico_pai_id).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const childrenMap = useMemo(() => {
    const map = new Map<string, any[]>();
    servicos.forEach((s) => {
      if (s.servico_pai_id) {
        const arr = map.get(s.servico_pai_id) || [];
        arr.push(s);
        map.set(s.servico_pai_id, arr.sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0)));
      }
    });
    return map;
  }, [servicos]);

  const matches = (s: any) => !search || norm(s.nome).includes(norm(search));

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Show selected service name
  const selectedSvc = servicos.find((s) => s.id === selectedId);

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-foreground">
        Serviço vinculado <span className="text-destructive">*</span>
      </span>

      {/* Current selection */}
      {selectedSvc && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <span className="font-medium">{servicoFullName(selectedSvc, servicos)}</span>
          {!disabled && (
            <button type="button" onClick={() => onChange(null)} className="ml-auto text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Search */}
      {!disabled && (
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
      )}

      {/* Tree */}
      {!disabled && (
        <div className="max-h-48 overflow-y-auto border border-input rounded-md p-2 bg-background space-y-0.5">
          {roots.length === 0 && (
            <span className="text-xs text-muted-foreground">Nenhum serviço cadastrado</span>
          )}
          {roots.map((root) => {
            const children = childrenMap.get(root.id) || [];
            const hasChildren = children.length > 0;
            const isMenu = root.tipo === "menu";
            const rootMatches = matches(root);
            const matchingChildren = children.filter(matches);

            if (search && !rootMatches && matchingChildren.length === 0) return null;

            if (hasChildren || isMenu) {
              const isExpanded = expanded.has(root.id) || (search.length > 0 && matchingChildren.length > 0);

              return (
                <div key={root.id}>
                  <div
                    className="flex items-center gap-1 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleExpand(root.id)}
                  >
                    {isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                    <span className="text-xs font-medium flex-1">{root.nome}</span>
                    {/* Allow selecting parent if it's not purely a menu */}
                    {!isMenu && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onChange(root.id); }}
                        className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${selectedId === root.id ? "bg-primary text-primary-foreground" : "text-primary hover:underline"}`}
                      >
                        {selectedId === root.id ? "✓" : "Selecionar"}
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="ml-5 space-y-0.5">
                      {matchingChildren.map((child: any) => (
                        <div
                          key={child.id}
                          onClick={() => onChange(child.id)}
                          className={`flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded transition-colors ${
                            selectedId === child.id
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <span className={`flex-1 ${selectedId === child.id ? "font-semibold text-primary" : ""}`}>
                            {child.nome}
                          </span>
                          {selectedId === child.id && <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            // Standalone service
            if (!rootMatches) return null;
            return (
              <div
                key={root.id}
                onClick={() => onChange(root.id)}
                className={`flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded transition-colors ${
                  selectedId === root.id
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-muted/50"
                }`}
              >
                <span className={`flex-1 ${selectedId === root.id ? "font-semibold text-primary" : ""}`}>
                  {root.nome}
                </span>
                {selectedId === root.id && <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Service KB Modal (Create / Edit)
   ═══════════════════════════════════════════════════════════════════════ */

const ACCEPTED_TYPES = ".pdf,.docx,.txt,.md";

function ServiceKBModal({
  row,
  servicos,
  allKbRows,
  onClose,
  onSaved,
}: {
  row: Record<string, any>;
  servicos: any[];
  allKbRows: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, any>>({ ...row });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const isEditing = !!values.id;

  function set(key: string, val: any) {
    setValues((p) => ({ ...p, [key]: val }));
  }

  /** When the user selects a service, check if there's already an active KB row */
  function handleServiceChange(servicoId: string | null) {
    if (!servicoId) {
      set("servico_id", null);
      return;
    }
    // If there's already an active KB row for this service, switch to editing it
    const existing = allKbRows.find(
      (r: any) => r.servico_id === servicoId && r.ativo && r.id !== values.id,
    );
    if (existing) {
      setValues({ ...existing });
      setErrorMsg(null);
    } else {
      set("servico_id", servicoId);
    }
  }

  /** Handle file selection */
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "docx", "txt", "md"].includes(ext)) {
      setErrorMsg("Tipo de arquivo não suportado. Use PDF, DOCX, TXT ou MD.");
      return;
    }

    setPendingFile(file);
    set("documento_nome", file.name);

    // For TXT and MD: extract text immediately
    if (ext === "txt" || ext === "md") {
      try {
        const text = await file.text();
        set("documento_texto_extraido", text);
        set("documento_status", "processado");
        set("documento_processado_em", new Date().toISOString());
        set("documento_erro", null);
      } catch {
        set("documento_status", "erro");
        set("documento_erro", "Erro ao ler arquivo de texto.");
      }
    } else {
      // PDF/DOCX: mark as pending - user can paste text manually
      set("documento_status", "pendente");
      set("documento_texto_extraido", values.documento_texto_extraido || "");
    }
  }

  /** Upload file to Storage */
  async function uploadFile(file: File, setorId: string, servicoId: string): Promise<string | null> {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${setorId}/${servicoId}/${timestamp}-${safeName}`;

    const { error } = await supabase.storage
      .from("base-conhecimento")
      .upload(path, file, { upsert: true });

    if (error) {
      console.error("Upload error:", error);
      return null;
    }
    return path;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!values.servico_id) {
      setErrorMsg("Selecione um serviço vinculado.");
      return;
    }

    setSaving(true);
    setUploading(false);
    setErrorMsg(null);

    const toSave = { ...values };

    // Auto-populate titulo from service name
    const svc = servicos.find((s: any) => s.id === toSave.servico_id);
    toSave.titulo = svc?.nome || "Serviço";

    // Clean optional fields
    if (toSave.link_acesso === "") toSave.link_acesso = null;
    if (toSave.instrucoes_agente === "") toSave.instrucoes_agente = null;
    if (toSave.documento_texto_extraido === "") toSave.documento_texto_extraido = null;
    toSave.updated_at = new Date().toISOString();

    // Upload file if pending
    if (pendingFile) {
      setUploading(true);
      const path = await uploadFile(pendingFile, toSave.setor_id, toSave.servico_id);
      setUploading(false);
      if (path) {
        toSave.documento_path = path;
        const { data: urlData } = supabase.storage.from("base-conhecimento").getPublicUrl(path);
        toSave.documento_url = urlData?.publicUrl || null;
      } else {
        setErrorMsg("Erro ao fazer upload do arquivo. Tente novamente.");
        setSaving(false);
        return;
      }
    }

    // If user pasted text manually for PDF/DOCX, mark as processed
    if (toSave.documento_texto_extraido && toSave.documento_status === "pendente") {
      toSave.documento_status = "processado";
      toSave.documento_processado_em = new Date().toISOString();
      toSave.documento_erro = null;
    }

    // Remove fields not in DB (if any)
    delete toSave.pergunta;
    delete toSave.resposta;

    const { error } = await upsertRow("base_conhecimento_agente", toSave);
    setSaving(false);
    if (error) {
      setErrorMsg(error.message ?? "Erro ao salvar.");
      return;
    }
    onSaved();
  }

  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  const ext = values.documento_nome?.split(".")?.pop()?.toLowerCase() || "";
  const isPdfDocx = ext === "pdf" || ext === "docx";
  const showTextArea = isPdfDocx || values.documento_texto_extraido;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold text-foreground">
            {isEditing ? "Editar configuração do serviço" : "Configurar serviço"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure o documento e regras que o agente usará para este serviço.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4 max-h-[75vh] overflow-y-auto">
          {/* 1. Service Picker */}
          <SingleServicePicker
            servicos={servicos}
            selectedId={values.servico_id}
            onChange={handleServiceChange}
            disabled={isEditing}
          />

          {/* 2. Agendável */}
          <div className="rounded-md border border-input p-3 space-y-2 bg-muted/20">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!values.agendavel}
                onChange={(e) => set("agendavel", e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-xs font-medium text-foreground">
                Permite agendamento
              </span>
            </label>
            <p className="text-[10px] text-muted-foreground ml-6">
              {values.agendavel
                ? "O agente responde com base no documento e pode perguntar se o usuário deseja agendar."
                : "O agente responde apenas com orientação e NÃO oferece agendamento."}
            </p>
          </div>

          {/* 3. Link */}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">
              Link de acesso / mais informações (opcional)
            </span>
            <input
              type="url"
              className={inputClass}
              value={values.link_acesso ?? ""}
              onChange={(e) => set("link_acesso", e.target.value)}
              placeholder="https://exemplo.mg.gov.br/pagina"
            />
            <span className="block text-[10px] text-muted-foreground">
              Página oficial, formulário, sistema externo ou documento público.
            </span>
          </label>

          {/* 4. Document Upload */}
          <div className="rounded-md border border-input p-3 space-y-3">
            <span className="text-xs font-medium text-foreground">
              Documento oficial para consulta do agente
            </span>

            {/* Current document info */}
            {values.documento_nome && (
              <div className="flex items-center gap-2 rounded bg-muted/30 px-3 py-2 text-xs">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1">{values.documento_nome}</span>
                <DocumentStatusBadge status={values.documento_status} />
                <button
                  type="button"
                  onClick={() => {
                    set("documento_nome", null);
                    set("documento_path", null);
                    set("documento_url", null);
                    set("documento_texto_extraido", "");
                    set("documento_status", "pendente");
                    setPendingFile(null);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Upload button */}
            <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-input px-4 py-3 hover:bg-muted/30 transition-colors">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {values.documento_nome ? "Substituir documento" : "Selecionar documento"}
              </span>
              <span className="text-[10px] text-muted-foreground ml-auto">PDF, DOCX, TXT, MD</span>
              <input
                type="file"
                accept={ACCEPTED_TYPES}
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>

            {/* Extracted text */}
            {(showTextArea || !values.documento_nome) && (
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground">
                  Conteúdo do documento
                  {isPdfDocx && " (cole aqui o texto extraído do PDF/DOCX)"}
                </span>
                <textarea
                  className={`${inputClass} min-h-[100px] max-h-[250px] font-mono text-[11px]`}
                  value={values.documento_texto_extraido ?? ""}
                  onChange={(e) => {
                    set("documento_texto_extraido", e.target.value);
                    if (e.target.value.trim()) {
                      set("documento_status", "processado");
                      set("documento_processado_em", new Date().toISOString());
                    }
                  }}
                  placeholder={
                    isPdfDocx
                      ? "Cole aqui o texto do documento PDF/DOCX. Em breve teremos extração automática."
                      : "O conteúdo será preenchido automaticamente ao enviar TXT/MD, ou cole manualmente o texto."
                  }
                />
                {values.documento_status === "pendente" && values.documento_nome && (
                  <div className="flex items-center gap-1 text-[10px] text-amber-600">
                    <Clock className="h-2.5 w-2.5" />
                    O texto do documento ainda não foi preenchido. Cole o conteúdo acima para que o agente possa usá-lo.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Agent Instructions */}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">
              Instruções complementares para o agente (opcional)
            </span>
            <textarea
              className={`${inputClass} min-h-[60px]`}
              value={values.instrucoes_agente ?? ""}
              onChange={(e) => set("instrucoes_agente", e.target.value)}
              placeholder="Ex: Responder de forma objetiva e informar que o servidor deve conferir a legislação vigente."
            />
          </label>

          {/* 6. Active */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!values.ativo}
              onChange={(e) => set("ativo", e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-xs font-medium text-foreground">Ativo</span>
          </label>

          {/* Error */}
          {errorMsg && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {errorMsg}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || uploading}>
              {(saving || uploading) && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {uploading ? "Enviando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
