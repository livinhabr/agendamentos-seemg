import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, Trash2, Plus } from "lucide-react";
import { deleteRow, upsertRow, type PgErr } from "@/lib/data/agenda";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "textarea" | "select" | "checkbox" | "time" | "datetime-local" | "date" | "select-multiple";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
  defaultValue?: any;
};

export type ColumnDef = {
  key: string;
  label: string;
  render?: (row: any) => ReactNode;
};

export function CrudTable({
  title,
  table,
  rows,
  columns,
  fields,
  loading,
  error,
  emptyText,
  baseRow = {},
  onChanged,
  validate,
  onSave,
  renderFormExtra,
}: {
  title: string;
  table: string;
  rows: any[];
  columns: ColumnDef[];
  fields: FieldDef[];
  loading?: boolean;
  error?: PgErr;
  emptyText?: string;
  baseRow?: Record<string, any>;
  onChanged?: () => void;
  validate?: (row: Record<string, any>) => string | null;
  onSave?: (row: Record<string, any>) => Promise<{ data?: any; error?: PgErr }>;
  renderFormExtra?: (row: Record<string, any>) => ReactNode;
}) {
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const isDev = import.meta.env.DEV;

  function startCreate() {
    const initial: Record<string, any> = { ...baseRow };
    for (const f of fields) {
      if (f.defaultValue !== undefined) initial[f.name] = f.defaultValue;
      else if (f.type === "checkbox") initial[f.name] = false;
      else initial[f.name] = "";
    }
    setEditing(initial);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Button size="sm" onClick={startCreate} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Novo
        </Button>
      </div>

      {error && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
          <p className="font-medium">
            Não foi possível carregar os dados. Tente novamente ou acione o suporte.
          </p>
          {isDev && <ErrorDetails err={error} />}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium">
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-6 text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="p-6 text-center text-xs text-muted-foreground"
                >
                  {emptyText ?? `Nenhum registro em ${table}.`}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2 align-top">
                      {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(row)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (!confirm("Excluir este registro?")) return;
                          const { error } = await deleteRow(table, row.id);
                          if (error)
                            alert(error.message ?? "Erro ao excluir.");
                          onChanged?.();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <FormModal
          title={editing.id ? "Editar" : "Novo registro"}
          fields={fields}
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (row) => {
            if (validate) {
              const msg = validate(row);
              if (msg) return msg;
            }
            const { error } = onSave ? await onSave(row) : await upsertRow(table, row);
            if (error) {
              return (
                error.message ??
                "Erro ao salvar. Verifique as permissões (RLS)."
              );
            }
            setEditing(null);
            onChanged?.();
            return null;
          }}
          renderFormExtra={renderFormExtra}
        />
      )}
    </div>
  );
}

function ErrorDetails({ err }: { err: NonNullable<PgErr> }) {
  return (
    <div className="font-mono text-[11px] space-y-0.5">
      <p>message: {err.message ?? "-"}</p>
      <p>code: {err.code ?? "-"}</p>
      <p>details: {err.details ?? "-"}</p>
      <p>hint: {err.hint ?? "-"}</p>
    </div>
  );
}

export function FormModal({
  title,
  fields,
  row,
  onClose,
  onSave,
  renderFormExtra,
}: {
  title: string;
  fields: FieldDef[];
  row: Record<string, any>;
  onClose: () => void;
  onSave: (row: Record<string, any>) => Promise<string | null>;
  renderFormExtra?: (row: Record<string, any>) => ReactNode;
}) {
  const [values, setValues] = useState<Record<string, any>>({ ...row });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isDev = import.meta.env.DEV;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    const msg = await onSave(values);
    setSaving(false);
    if (msg) setErrorMsg(msg);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4 max-h-[70vh] overflow-y-auto">
          {fields.map((f) => (
            <FieldRow
              key={f.name}
              field={f}
              value={values[f.name]}
              onChange={(v) => setValues((p) => ({ ...p, [f.name]: v }))}
            />
          ))}

          {errorMsg && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {errorMsg}
              {isDev && (
                <p className="mt-1 text-[10px] italic text-red-600">
                  (detalhes técnicos no console / aba network)
                </p>
              )}
            </div>
          )}

          {renderFormExtra && renderFormExtra(values)}

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

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: any;
  onChange: (v: any) => void;
}) {
  const base =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </span>
      {field.type === "select-multiple" ? (
        <div className="space-y-1 max-h-40 overflow-y-auto border border-input rounded-md p-2 bg-background">
          {field.options && field.options.length > 0 ? (
            field.options.map((o) => {
              const checked = Array.isArray(value) && value.includes(o.value);
              return (
                <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const current = Array.isArray(value) ? [...value] : [];
                      if (e.target.checked) {
                        current.push(o.value);
                      } else {
                        const idx = current.indexOf(o.value);
                        if (idx > -1) current.splice(idx, 1);
                      }
                      onChange(current);
                    }}
                    className="h-4 w-4"
                  />
                  <span>{o.label}</span>
                </label>
              );
            })
          ) : (
            <span className="text-xs text-muted-foreground">Nenhum disponível</span>
          )}
        </div>
      ) : field.type === "textarea" ? (
        <textarea
          className={`${base} min-h-[80px]`}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={field.placeholder}
        />
      ) : field.type === "select" ? (
        <select
          className={base}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        >
          <option value="">— selecione —</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4"
        />
      ) : (
        <input
          type={field.type ?? "text"}
          className={base}
          value={value ?? ""}
          onChange={(e) =>
            onChange(
              field.type === "number"
                ? e.target.value === ""
                  ? null
                  : Number(e.target.value)
                : e.target.value,
            )
          }
          required={field.required}
          placeholder={field.placeholder}
        />
      )}
      {field.hint && (
        <span className="block text-[11px] text-muted-foreground">{field.hint}</span>
      )}
    </label>
  );
}
