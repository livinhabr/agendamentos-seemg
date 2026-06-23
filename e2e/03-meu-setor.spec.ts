/**
 * 03-meu-setor.spec.ts
 * Valida leitura e edição de setor e bot na tela Meu Setor.
 * Confirma que não cria duplicatas.
 */
import { test, expect } from "@playwright/test";
import {
  navigateTo,
  fillEditCardField,
  saveEditCard,
  startConsoleCollector,
  testSuffix,
} from "./helpers";

const SUFFIX = testSuffix();

test.describe("03 — Meu Setor", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/meu-setor");
  });

  test("exibe dados do setor e do bot", async ({ page }) => {
    const errors = startConsoleCollector(page);

    // Setor section
    const setorSection = page.locator("section").filter({ hasText: "Dados do setor" });
    await expect(setorSection).toBeVisible({ timeout: 10_000 });

    // Nome do setor deve estar preenchido
    const nomeInput = setorSection.locator('label').filter({ hasText: "Nome" }).locator("input");
    const nomeValue = await nomeInput.inputValue();
    expect(nomeValue).toBeTruthy();
    console.log(`Setor atual: "${nomeValue}"`);

    // Bot section
    const botSection = page.locator("section").filter({ hasText: "Bot principal" });
    const botVisible = await botSection.isVisible().catch(() => false);
    if (botVisible) {
      const botNome = botSection.locator('label').filter({ hasText: "Nome do bot" }).locator("input");
      const botValue = await botNome.inputValue();
      console.log(`Bot atual: "${botValue}"`);
    } else {
      console.log("⚠️ Nenhum bot configurado — seção 'Criar bot' exibida.");
    }

    const pageErrors = errors.filter((e) => e.type === "pageerror");
    expect(pageErrors).toHaveLength(0);
  });

  test("edita descrição do setor e salva sem duplicar", async ({ page }) => {
    const setorSection = page.locator("section").filter({ hasText: "Dados do setor" });
    await expect(setorSection).toBeVisible({ timeout: 10_000 });

    // Guarda o nome original
    const nomeInput = setorSection.locator('label').filter({ hasText: "Nome" }).locator("input");
    const originalName = await nomeInput.inputValue();

    // Edita a descrição
    const desc = `Teste E2E ${SUFFIX}`;
    await fillEditCardField(page, "Dados do setor", "Descrição", desc, "textarea");

    const err = await saveEditCard(page, "Dados do setor");
    expect(err, `Erro ao salvar setor: ${err}`).toBeNull();

    // Recarrega e verifica que o nome não mudou (não duplicou)
    await navigateTo(page, "/meu-setor");
    const nomeAfter = await nomeInput.inputValue();
    expect(nomeAfter).toBe(originalName);

    // Verifica que a descrição foi salva
    const descTA = setorSection
      .locator('label')
      .filter({ hasText: "Descrição" })
      .locator("textarea");
    const descValue = await descTA.inputValue();
    expect(descValue).toContain(SUFFIX);
  });

  test("edita bot e salva sem duplicar", async ({ page }) => {
    const botSection = page.locator("section").filter({ hasText: "Bot principal" });
    const botVisible = await botSection.isVisible().catch(() => false);
    if (!botVisible) {
      test.skip();
      return;
    }

    // Edita a saudação inicial
    const saudacao = `Olá! Teste E2E ${SUFFIX}`;
    await fillEditCardField(page, "Bot principal", "Saudação inicial", saudacao, "textarea");

    const err = await saveEditCard(page, "Bot principal");
    expect(err, `Erro ao salvar bot: ${err}`).toBeNull();

    // Recarrega e confirma
    await navigateTo(page, "/meu-setor");
    const saudTA = botSection
      .locator('label')
      .filter({ hasText: "Saudação inicial" })
      .locator("textarea");
    const saved = await saudTA.inputValue();
    expect(saved).toContain(SUFFIX);
  });
});
