import fs from "fs";
import { execSync } from "child_process";

const envContent = fs.readFileSync("backend/.env", "utf-8");
const vars = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    vars[match[1].trim()] = match[2].trim();
  }
});

const secretsToDeploy = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "USE_N8N_CHAT",
  "OPENAI_API_KEY"
];

console.log("Iniciando deploy de secrets para rceoxuywkvzxllesjeqs...");

for (const key of secretsToDeploy) {
  if (vars[key] && vars[key].trim() !== "") {
    try {
      // Usar execSync de forma que não vaze o valor na saída em caso de erro simples
      console.log(`Fazendo deploy do secret: ${key}...`);
      execSync(`npx supabase secrets set ${key}="${vars[key]}" --project-ref rceoxuywkvzxllesjeqs`, { stdio: "ignore" });
      console.log(`✅ ${key} configurado com sucesso.`);
    } catch (err) {
      console.error(`❌ Erro ao configurar ${key}. Verifique se você está autenticado no Supabase CLI.`);
    }
  } else {
    console.log(`⚠️ ${key} está vazio no backend/.env e foi ignorado.`);
  }
}

console.log("Deploy de secrets finalizado.");
