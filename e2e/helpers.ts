/**
 * Helpers reutilizáveis para todos os testes E2E.
 */
import { type Page, type Locator, expect } from "@playwright/test";

/* ------------------------------------------------------------------ */
/*  Navegação                                                         */
/* ------------------------------------------------------------------ */

/** Navega para uma rota do portal e espera o spinner desaparecer. */
export async function navigateTo(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  await waitForNoSpinner(page);
}

/** Espera todos os spinners (Loader2) desaparecerem. */
export async function waitForNoSpinner(page: Page, timeout = 15_000) {
  // Espera carregar o layout principal (spinner do SectorProvider)
  await page
    .locator(".animate-spin")
    .first()
    .waitFor({ state: "hidden", timeout })
    .catch(() => {
      /* pode não ter spinner algum, ok */
    });
  // Dá tempo para loaders secundários
  await page.waitForTimeout(500);
}

/* ------------------------------------------------------------------ */
/*  Sidebar / Tabs                                                    */
/* ------------------------------------------------------------------ */

/** Clica em um link do sidebar. */
export async function clickSidebarLink(page: Page, label: string) {
  await page.locator("aside nav").getByText(label, { exact: true }).click();
  await waitForNoSpinner(page);
}

/** Clica em uma tab. */
export async function clickTab(page: Page, label: string) {
  await page
    .locator('[role="tablist"]')
    .getByText(label, { exact: true })
    .click();
  await page.waitForTimeout(300);
}

/* ------------------------------------------------------------------ */
/*  CrudTable helpers                                                 */
/* ------------------------------------------------------------------ */

/** Clica no botão "Novo" de uma CrudTable. */
export async function clickNewButton(page: Page) {
  await page.getByRole("button", { name: /Novo/i }).click();
  await page.waitForTimeout(300);
}

/** Retorna o locator do modal de formulário (FormModal). */
export function getModal(page: Page): Locator {
  return page.locator(".fixed.inset-0.z-50");
}

/** Preenche um campo do FormModal pelo label. */
export async function fillModalField(
  page: Page,
  label: string,
  value: string,
  type: "text" | "textarea" | "select" | "checkbox" | "time" | "datetime-local" = "text",
) {
  const modal = getModal(page);

  if (type === "checkbox") {
    const checkbox = modal
      .locator("label")
      .filter({ hasText: label })
      .locator('input[type="checkbox"]');
    if (value === "true") await checkbox.check();
    else await checkbox.uncheck();
    return;
  }

  if (type === "select") {
    const select = modal
      .locator("label")
      .filter({ hasText: label })
      .locator("select");
    await select.selectOption(value);
    return;
  }

  if (type === "textarea") {
    const ta = modal
      .locator("label")
      .filter({ hasText: label })
      .locator("textarea");
    await ta.fill(value);
    return;
  }

  // text, time, datetime-local, email, number
  const input = modal
    .locator("label")
    .filter({ hasText: label })
    .locator("input");
  await input.fill(value);
}

/** Clica em Salvar no modal e espera ele fechar (sucesso) ou retorna erro. */
export async function saveModal(
  page: Page,
  expectSuccess = true,
): Promise<string | null> {
  const modal = getModal(page);
  await modal.getByRole("button", { name: /Salvar/i }).click();
  await page.waitForTimeout(1_000);

  if (expectSuccess) {
    // Modal deve fechar
    const visible = await modal.isVisible().catch(() => false);
    if (visible) {
      // Pode haver erro exibido
      const errorBox = modal.locator(".text-red-800");
      const errText = await errorBox
        .textContent()
        .catch(() => null);
      return errText ?? "Modal não fechou (erro desconhecido)";
    }
    return null; // sucesso
  }
  return null;
}

/** Clica no botão de edição (Pencil) de uma linha da CrudTable que contenha o texto. */
export async function clickEditRow(page: Page, text: string) {
  const row = page.locator("tr").filter({ hasText: text }).first();
  await row.getByRole("button").first().click(); // Pencil button is first
  await page.waitForTimeout(300);
}

/** Verifica que uma linha com determinado texto existe na tabela. */
export async function expectRowExists(page: Page, text: string) {
  await expect(
    page.locator("tr").filter({ hasText: text }).first(),
  ).toBeVisible({ timeout: 5_000 });
}

/** Verifica que uma linha NÃO existe na tabela. */
export async function expectRowNotExists(page: Page, text: string) {
  await expect(
    page.locator("tr").filter({ hasText: text }).first(),
  ).not.toBeVisible({ timeout: 3_000 });
}

/* ------------------------------------------------------------------ */
/*  Console error collection                                          */
/* ------------------------------------------------------------------ */

export type ConsoleEntry = { type: string; text: string };

/** Inicia coleta de erros do console na página. */
export function startConsoleCollector(page: Page): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      entries.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (err) => {
    entries.push({ type: "pageerror", text: err.message });
  });
  return entries;
}

/* ------------------------------------------------------------------ */
/*  EditCard helpers (Meu Setor page)                                 */
/* ------------------------------------------------------------------ */

/** Preenche um campo de um EditCard (formulário inline, não modal) pelo label. */
export async function fillEditCardField(
  page: Page,
  sectionTitle: string,
  fieldLabel: string,
  value: string,
  type: "text" | "textarea" | "select" | "email" = "text",
) {
  const section = page.locator("section").filter({ hasText: sectionTitle });

  if (type === "select") {
    const select = section
      .locator("label")
      .filter({ hasText: fieldLabel })
      .locator("select");
    await select.selectOption(value);
    return;
  }

  if (type === "textarea") {
    const ta = section
      .locator("label")
      .filter({ hasText: fieldLabel })
      .locator("textarea");
    await ta.fill(value);
    return;
  }

  const input = section
    .locator("label")
    .filter({ hasText: fieldLabel })
    .locator("input");
  await input.fill(value);
}

/** Clica em Salvar de um EditCard (formulário inline). */
export async function saveEditCard(
  page: Page,
  sectionTitle: string,
): Promise<string | null> {
  const section = page.locator("section").filter({ hasText: sectionTitle });
  await section.getByRole("button", { name: /Salvar/i }).click();
  await page.waitForTimeout(1_500);

  const msg = section.locator(".text-xs");
  const text = await msg.textContent().catch(() => "");
  if (text?.includes("Não foi possível")) return text;
  return null;
}

/* ------------------------------------------------------------------ */
/*  Unique suffix for test data (avoid duplicates across runs)        */
/* ------------------------------------------------------------------ */

const _ts = Date.now().toString(36).slice(-4);
export function testSuffix() {
  return _ts;
}
