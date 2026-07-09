const payload = {
  setor_slug: "metropolitana-c",
  bot_slug: "atendimento-metropolitana-c",
  canal_id: "9619a0b0-6ba6-4faa-8219-059318b230d3",
  session_id: "test-node-" + Date.now(),
  message: "oi"
};

const res = await fetch("https://rceoxuywkvzxllesjeqs.supabase.co/functions/v1/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

console.log("Status:", res.status);
const headers = {};
res.headers.forEach((v, k) => { headers[k] = v; });
console.log("Headers:", JSON.stringify(headers, null, 2));
const body = await res.text();
console.log("Body:", body);
