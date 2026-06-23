/**
 * 05-equipe-agenda.spec.ts
 * Valida CRUDs de calendários, atendentes, horários e exceções.
 * Confirma modo_conexao, calendario_id, atendentes_servicos,
 * e que tipo de exceção grava corretamente.
 */
import { test, expect } from "@playwright/test";
import {
  navigateTo,
  clickTab,
  clickNewButton,
  fillModalField,
  saveModal,
  clickEditRow,
  expectRowExists,
  getModal,
  startConsoleCollector,
  testSuffix,
} from "./helpers";

const S = testSuffix();

test.describe("05 — Equipe e Agenda", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/equipe-agenda");
  });

  /* ---- Calendários ---- */
  test("cria calendário com modo_conexao = shared_with_n8n", async ({ page }) => {
    const errors = startConsoleCollector(page);
    await clickTab(page, "Calendários / e-mails");

    const nome = `Cal E2E ${S}`;
    await clickNewButton(page);
    await fillModalField(page, "Nome do calendário", nome);
    await fillModalField(
      page,
      "Google Calendar ID ou e-mail",
      "teste-e2e@educacao.mg.gov.br",
    );
    await fillModalField(page, "Modo de conexão", "shared_with_n8n", "select");
    await fillModalField(page, "Status", "pendente", "select");

    const err = await saveModal(page);
    expect(err, `Erro ao criar calendário: ${err}`).toBeNull();
    await expectRowExists(page, nome);

    // Confirma coluna "Conexão" exibe texto correto
    const row = page.locator("tr").filter({ hasText: nome });
    const conexaoCell = await row.textContent();
    expect(conexaoCell).toContain("Compartilhado com n8n");

    const pageErrors = errors.filter((e) => e.type === "pageerror");
    expect(pageErrors).toHaveLength(0);
  });

  test("confirma que modo_conexao só aceita shared_with_n8n ou node_oauth", async ({ page }) => {
    await clickTab(page, "Calendários / e-mails");
    await clickNewButton(page);

    const modal = getModal(page);
    const select = modal
      .locator("label")
      .filter({ hasText: "Modo de conexão" })
      .locator("select");

    const options = await select.locator("option").allTextContents();
    // Remove "— selecione —"
    const filtered = options.filter((o) => !o.includes("selecione"));
    console.log(`Opções de modo_conexao: ${JSON.stringify(filtered)}`);

    expect(filtered).toHaveLength(2);
    expect(filtered).toContain("Compartilhado com n8n");
    expect(filtered).toContain("OAuth via backend");

    await modal.getByRole("button", { name: /Cancelar/i }).click();
  });

  /* ---- Atendentes ---- */
  test("cria atendente com calendario_id e serviços vinculados", async ({ page }) => {
    await clickTab(page, "Atendentes");

    const nome = `Atendente E2E ${S}`;
    await clickNewButton(page);
    await fillModalField(page, "Nome", nome);
    await fillModalField(
      page,
      "E-mail institucional",
      `atend.e2e.${S}@educacao.mg.gov.br`,
    );
    await fillModalField(page, "Cargo", "Analista de Teste");

    // Seleciona primeiro calendário disponível
    const modal = getModal(page);
    const calSelect = modal
      .locator("label")
      .filter({ hasText: "Calendário vinculado" })
      .locator("select");
    const calOptions = await calSelect.locator("option").allTextContents();
    const firstCal = calOptions.find((o) => !o.includes("selecione"));
    if (firstCal) {
      await calSelect.selectOption({ index: 1 });
      console.log(`Calendário selecionado: "${firstCal}"`);
    } else {
      console.log("⚠️ Nenhum calendário disponível para vincular");
    }

    // Seleciona serviço(s) vinculado(s) — checkboxes
    const servicosSection = modal
      .locator("label")
      .filter({ hasText: "Serviços vinculados" });
    const checkboxes = servicosSection.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    if (cbCount > 0) {
      await checkboxes.first().check();
      console.log(`Vinculou primeiro serviço ao atendente`);
    } else {
      console.log("⚠️ Nenhum serviço disponível para vincular");
    }

    const err = await saveModal(page);
    expect(err, `Erro ao criar atendente: ${err}`).toBeNull();
    await expectRowExists(page, nome);

    // Verifica coluna "Serviços" na tabela
    const row = page.locator("tr").filter({ hasText: nome });
    const rowText = await row.textContent();
    // Deve ter algo diferente de "Nenhum" se vinculamos um serviço
    if (cbCount > 0) {
      const hasService = !rowText?.includes("Nenhum");
      console.log(
        `Coluna Serviços: ${hasService ? "OK (serviço vinculado)" : "FALHA (mostra Nenhum)"}`,
      );
      expect(rowText).not.toContain("Nenhum");
    }
  });

  /* ---- Horários ---- */
  test("cria janela de atendimento", async ({ page }) => {
    await clickTab(page, "Horários e pausas");

    await clickNewButton(page);
    await fillModalField(page, "Dia da semana", "1", "select"); // Segunda
    await fillModalField(page, "Tipo de janela", "trabalho", "select");
    await fillModalField(page, "Hora início", "08:00", "text");
    await fillModalField(page, "Hora fim", "12:00", "text");

    // Seleciona primeiro atendente disponível
    const modal = getModal(page);
    const attSelect = modal
      .locator("label")
      .filter({ hasText: "Atendente" })
      .locator("select");
    const attOptions = await attSelect.locator("option").allTextContents();
    if (attOptions.length > 1) {
      await attSelect.selectOption({ index: 1 });
    }

    const err = await saveModal(page);
    expect(err, `Erro ao criar janela: ${err}`).toBeNull();
    await expectRowExists(page, "Segunda");
  });

  /* ---- Exceções ---- */
  test("cria exceção tipo bloqueio", async ({ page }) => {
    const errors = startConsoleCollector(page);
    await clickTab(page, "Exceções");

    await clickNewButton(page);
    await fillModalField(page, "Tipo", "bloqueio", "select");
    await fillModalField(page, "Início", "2026-07-01T08:00", "text");
    await fillModalField(page, "Fim", "2026-07-01T18:00", "text");
    await fillModalField(page, "Motivo", `Bloqueio E2E ${S}`, "textarea");

    const err = await saveModal(page);
    expect(err, `Erro ao criar exceção bloqueio: ${err}`).toBeNull();
    await expectRowExists(page, "bloqueio");

    const pageErrors = errors.filter((e) => e.type === "pageerror");
    expect(pageErrors).toHaveLength(0);
  });

  test("cria exceção tipo horario_extra", async ({ page }) => {
    await clickTab(page, "Exceções");

    await clickNewButton(page);
    await fillModalField(page, "Tipo", "horario_extra", "select");
    await fillModalField(page, "Início", "2026-07-05T09:00", "text");
    await fillModalField(page, "Fim", "2026-07-05T13:00", "text");
    await fillModalField(page, "Motivo", `Extra E2E ${S}`, "textarea");

    const err = await saveModal(page);
    expect(err, `Erro ao criar exceção horario_extra: ${err}`).toBeNull();
    await expectRowExists(page, "horario_extra");
  });

  test("confirma que tipo não grava valores inválidos", async ({ page }) => {
    await clickTab(page, "Exceções");

    // Verifica as opções disponíveis no formulário
    await clickNewButton(page);
    const modal = getModal(page);
    const tipoSelect = modal
      .locator("label")
      .filter({ hasText: "Tipo" })
      .locator("select");

    const options = await tipoSelect.locator("option").allTextContents();
    const filtered = options
      .filter((o) => !o.includes("selecione"))
      .map((o) => o.trim());

    console.log(`Opções de tipo exceção: ${JSON.stringify(filtered)}`);

    // Deve ter APENAS "Bloqueio" e "Janela extra"
    expect(filtered).toHaveLength(2);

    // Na tabela, confirma que nenhuma linha tem "feriado", "manutenção", "extra" (isolado), "Janela extra"
    await modal.getByRole("button", { name: /Cancelar/i }).click();
    const tableText = await page.locator("tbody").textContent();
    expect(tableText).not.toMatch(/\bferiado\b/i);
    expect(tableText).not.toMatch(/\bmanuten/i);
    // "extra" sozinho (não "horario_extra")
    const rows = await page.locator("tbody tr td:first-child").allTextContents();
    for (const r of rows) {
      const val = r.trim();
      if (val && val !== "—") {
        expect(["bloqueio", "horario_extra"]).toContain(val);
      }
    }
  });
});
