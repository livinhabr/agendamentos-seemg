import { createFileRoute } from "@tanstack/react-router";
import { PortalLayout, PageHeader } from "@/components/portal/PortalLayout";
import { useSector } from "@/lib/context/SectorContext";
import { useResource } from "@/lib/hooks/useResource";
import { getAppointmentsBySector } from "@/lib/data/agenda";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/agendamentos")({
  head: () => ({ meta: [{ title: "Agendamentos — Agenda SEE-MG" }] }),
  component: () => (
    <PortalLayout>
      <AgendamentosPage />
    </PortalLayout>
  ),
});

function AgendamentosPage() {
  const { selectedSectorId } = useSector();
  const { data, error, loading } = useResource(
    () => getAppointmentsBySector(selectedSectorId ? [selectedSectorId] : []),
    [selectedSectorId],
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Agendamentos" description="Histórico de agendamentos do setor (somente leitura)." />

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Início</th>
              <th className="px-3 py-2">Fim</th>
              <th className="px-3 py-2">Usuário</th>
              <th className="px-3 py-2">E-mail</th>
              <th className="px-3 py-2">Serviço</th>
              <th className="px-3 py-2">Atendente</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-6 text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-xs text-muted-foreground">
                  Não foi possível carregar os agendamentos. Tente novamente ou acione o suporte.
                  {import.meta.env.DEV && (
                    <pre className="mt-2 text-left text-[10px] text-red-700">
                      {JSON.stringify(error, null, 2)}
                    </pre>
                  )}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-xs text-muted-foreground">
                  Nenhum agendamento encontrado.
                </td>
              </tr>
            ) : (
              data.map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 align-top">{r.inicio ?? "—"}</td>
                  <td className="px-3 py-2 align-top">{r.fim ?? "—"}</td>
                  <td className="px-3 py-2 align-top">{r.nome_usuario ?? "—"}</td>
                  <td className="px-3 py-2 align-top">{r.email_usuario ?? "—"}</td>
                  <td className="px-3 py-2 align-top">{r.servico_id ?? "—"}</td>
                  <td className="px-3 py-2 align-top">{r.atendente_id ?? "—"}</td>
                  <td className="px-3 py-2 align-top">{r.status ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
