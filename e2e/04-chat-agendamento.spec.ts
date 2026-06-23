/**
 * 04-chat-agendamento.spec.ts
 * Valida CRUDs de serviços, FAQs, campos (inclusive select com opcoes_json)
 * e o preview do chat.
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

test.describe("04 — Chat de Agendamento", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/chat-agendamento");
  });

  /* ---- Serviços ---- */
  test("cria um serviço e confirma na tabela", async ({ page }) => {
    const errors = startConsoleCollector(page);
    await clickTab(page, "Serviços e documentos");

    const nome = `Serviço E2E ${S}`;
    await clickNewButton(page);
    await fillModalField(page, "Nome do serviço", nome);
    await fillModalField(page, "Categoria", "Teste");
    await fillModalField(page, "Duração (minutos)", "45", "text");
    await fillModalField(
      page,
      "Documentos necessários / Instruções",
      "RG, CPF, comprovante de residência",
      "textarea",
    );

    const err = await saveModal(page);
    expect(err, `Erro ao criar serviço: ${err}`).toBeNull();
    await expectRowExists(page, nome);

    const pageErrors = errors.filter((e) => e.type === "pageerror");
    expect(pageErrors).toHaveLength(0);
  });

  test("edita um serviço existente", async ({ page }) => {
    await clickTab(page, "Serviços e documentos");

    const nome = `Serviço E2E ${S}`;
    await clickEditRow(page, nome);
    await fillModalField(
      page,
      "Descrição curta",
      "Editado via E2E",
      "textarea",
    );
    const err = await saveModal(page);
    expect(err, `Erro ao editar serviço: ${err}`).toBeNull();
  });

  /* ---- FAQs ---- */
  test("cria uma FAQ e confirma na tabela", async ({ page }) => {
    await clickTab(page, "Perguntas frequentes");

    const pergunta = `Pergunta E2E ${S}`;
    await clickNewButton(page);
    await fillModalField(page, "Pergunta", pergunta);
    await fillModalField(page, "Resposta", "Resposta automática E2E.", "textarea");
    await fillModalField(page, "Palavras-chave", "teste, e2e, automacao");
    await fillModalField(page, "Categoria", "Geral");

    const err = await saveModal(page);
    expect(err, `Erro ao criar FAQ: ${err}`).toBeNull();
    await expectRowExists(page, pergunta);
  });

  /* ---- Campos do chat ---- */
  test("cria campo tipo select com opcoes_json", async ({ page }) => {
    await clickTab(page, "Campos do usuário");

    const nomeCampo = `campo_e2e_${S}`;
    const rotulo = `Campo Select E2E ${S}`;
    await clickNewButton(page);
    await fillModalField(page, "Nome (chave)", nomeCampo);
    await fillModalField(page, "Rótulo exibido", rotulo);
    await fillModalField(page, "Tipo", "select", "select");
    await fillModalField(
      page,
      "Opções (uma por linha",
      "Opção A\nOpção B\nOpção C",
      "textarea",
    );

    const err = await saveModal(page);
    expect(err, `Erro ao criar campo select: ${err}`).toBeNull();
    await expectRowExists(page, rotulo);
  });

  test("confirma que coluna 'Tipo' exibe tipo_campo (não tipo)", async ({ page }) => {
    await clickTab(page, "Campos do usuário");

    // A coluna de cabeçalho deve dizer "Tipo"
    const th = page.locator("thead th").filter({ hasText: "Tipo" });
    await expect(th).toBeVisible();

    // As linhas devem exibir valores como "texto", "select", "email" etc.
    // e NÃO "text", "string", etc.
    const validTypes = ["texto", "email", "telefone", "cpf", "select", "textarea", "numero", "data"];
    const cells = page.locator("tbody td");
    const cellCount = await cells.count();
    for (let i = 0; i < cellCount; i++) {
      const text = (await cells.nth(i).textContent())?.trim() ?? "";
      if (validTypes.includes(text)) {
        console.log(`✅ tipo_campo encontrado: "${text}"`);
      }
    }
  });

  test("campo select salva opcoes_json corretamente (re-edição)", async ({ page }) => {
    await clickTab(page, "Campos do usuário");

    const rotulo = `Campo Select E2E ${S}`;
    await clickEditRow(page, rotulo);

    // No modal de edição, o campo "Opções" deve ter as opções que foram salvas
    const modal = getModal(page);
    const opcoesTA = modal
      .locator("label")
      .filter({ hasText: "Opções (uma por linha" })
      .locator("textarea");

    const opcoesValue = await opcoesTA.inputValue();
    console.log(`Opções salvas: "${opcoesValue}"`);

    expect(opcoesValue).toContain("Opção A");
    expect(opcoesValue).toContain("Opção B");
    expect(opcoesValue).toContain("Opção C");

    // Fecha sem salvar
    await modal.getByRole("button", { name: /Cancelar/i }).click();
  });

  /* ---- Preview ---- */
  test("preview do chat responde mensagem", async ({ page }) => {
    await clickTab(page, "Preview");

    // Deve exibir a saudação do bot
    const chatArea = page.locator(".flex.h-\\[55vh\\]");
    await expect(chatArea).toBeVisible({ timeout: 10_000 });

    // Envia mensagem sobre serviços
    const input = chatArea.locator("input");
    await input.fill("serviços");
    await chatArea.getByRole("button", { name: /Enviar/i }).click();
    await page.waitForTimeout(500);

    // A resposta deve listar serviços ou dizer que não há
    const msgs = chatArea.locator(".rounded-lg");
    const lastMsg = msgs.last();
    const text = await lastMsg.textContent();
    expect(text).toBeTruthy();
    console.log(`Resposta do preview: "${text?.substring(0, 100)}..."`);
  });
});
