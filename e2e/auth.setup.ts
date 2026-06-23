/**
 * Auth setup — executa em modo headed para que o usuário faça login
 * manual no Google Educação. Após o login, salva o storageState
 * (cookies + localStorage) para reuso nos demais testes.
 *
 * Execute apenas uma vez:
 *   npx playwright test --project=setup
 */
import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FILE = path.join(__dirname, "..", ".auth", "user.json");

setup("authenticate via Google (manual)", async ({ page }) => {
  setup.setTimeout(180_000); // 3 min total

  // Garante que o diretório .auth existe
  const dir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Abre a tela de login e espera a hydration do React completar
  await page.goto("/", { waitUntil: "networkidle" });

  // Espera o texto "Agenda Setorial" aparecer em qualquer lugar da página
  // (pode estar em h1, h3, ou div durante SSR/hydration)
  await page.waitForSelector("text=Agenda Setorial", { timeout: 30_000 });

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  FAÇA LOGIN MANUALMENTE NO NAVEGADOR QUE ABRIU.        ║");
  console.log("║  Clique em 'Entrar com Google Educação' e complete     ║");
  console.log("║  o fluxo OAuth no Google.                              ║");
  console.log("║  O teste detectará o redirect automaticamente.         ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Espera até redirecionar para /inicio ou /painel ou /cadastro-inicial (até 150s para login manual)
  await page.waitForURL(
    (url) =>
      url.pathname.includes("/inicio") ||
      url.pathname.includes("/painel") ||
      url.pathname.includes("/cadastro-inicial"),
    { timeout: 150_000 },
  );

  // Se caiu em /painel, aguarda redirect para /inicio
  if (page.url().includes("/painel")) {
    await page.waitForURL("**/inicio", { timeout: 15_000 });
  }

  // Espera carregar a página
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2_000);

  console.log("✅ Login detectado. Salvando sessão em .auth/user.json ...");

  // Salva o estado de autenticação
  await page.context().storageState({ path: AUTH_FILE });

  console.log("✅ Sessão salva com sucesso.\n");
});
