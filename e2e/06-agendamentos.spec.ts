/**
 * 06-agendamentos.spec.ts
 * Valida a tela Agendamentos: carregamento sem erro de coluna,
 * uso de "inicio"/"fim" (não "data_inicio"), e sem erros no console.
 */
import { test, expect } from "@playwright/test";
import { navigateTo, startConsoleCollector } from "./helpers";

test.describe("06 — Agendamentos", () => {
  test("abre sem erro e exibe colunas inicio/fim", async ({ page }) => {
    const errors = startConsoleCollector(page);

    await navigateTo(page, "/agendamentos");

    // Título da página
    await expect(page.locator("h1")).toContainText("Agendamentos");

    // Verifica que as colunas de cabeçalho são "Início" e "Fim" (não "data_inicio")
    const headers = page.locator("thead th");
    const headerTexts = await headers.allTextContents();
    console.log(`Colunas da tabela: ${JSON.stringify(headerTexts)}`);

    expect(headerTexts.map((h) => h.trim())).toContain("Início");
    expect(headerTexts.map((h) => h.trim())).toContain("Fim");
    expect(headerTexts.map((h) => h.toLowerCase())).not.toContain("data_inicio");

    // Verifica que não há mensagem de erro de carregamento
    const errorDiv = page.locator("text=Não foi possível carregar");
    const hasError = await errorDiv.isVisible().catch(() => false);
    if (hasError) {
      // Captura detalhes do erro em dev
      const pre = page.locator("pre");
      const errDetail = await pre.textContent().catch(() => null);
      console.error(`❌ Erro ao carregar agendamentos: ${errDetail}`);
    }
    expect(hasError, "Erro de carregamento na tela de agendamentos").toBeFalsy();

    // Deve mostrar ou dados ou "Nenhum agendamento encontrado"
    const body = page.locator("tbody");
    const bodyText = await body.textContent();
    const hasData = bodyText?.includes("Nenhum agendamento") === false;
    console.log(
      hasData
        ? `✅ Agendamentos carregados (tabela com dados)`
        : `ℹ️ Nenhum agendamento encontrado (tabela vazia, mas sem erro)`,
    );

    // Sem erros no console
    const pageErrors = errors.filter((e) => e.type === "pageerror");
    expect(
      pageErrors,
      `Erros de página: ${JSON.stringify(pageErrors)}`,
    ).toHaveLength(0);

    // Verifica especificamente que não há erro "column does not exist"
    const allConsole = errors.filter(
      (e) =>
        e.text.toLowerCase().includes("column") &&
        e.text.toLowerCase().includes("does not exist"),
    );
    expect(
      allConsole,
      `Erros de coluna inexistente: ${JSON.stringify(allConsole)}`,
    ).toHaveLength(0);
  });

  test("confirma que dados usam campos inicio e fim (não data_inicio)", async ({ page }) => {
    await navigateTo(page, "/agendamentos");

    // Verificação no código-fonte da página (se há dados)
    // Checa que as células da tabela não renderizam "data_inicio"
    const allText = await page.locator("table").textContent();
    expect(allText?.toLowerCase()).not.toContain("data_inicio");
    console.log("✅ Nenhuma referência a 'data_inicio' encontrada na tabela renderizada");
  });
});
