// Test all Edge Functions

async function testFunction(name, url, options) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`URL: ${url}`);
  console.log(`${"=".repeat(60)}`);
  
  try {
    const res = await fetch(url, options);
    console.log(`Status: ${res.status}`);
    
    // Check CORS headers
    const cors = res.headers.get("access-control-allow-origin");
    console.log(`CORS Origin: ${cors || "MISSING!"}`);
    
    const body = await res.text();
    // Truncate long bodies
    const displayBody = body.length > 500 ? body.substring(0, 500) + "..." : body;
    console.log(`Body: ${displayBody}`);
    
    return { name, status: res.status, cors: !!cors, ok: true };
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    return { name, status: 0, cors: false, ok: false, error: err.message };
  }
}

const BASE = "https://rceoxuywkvzxllesjeqs.supabase.co/functions/v1";
const results = [];

// 1. Chat - OPTIONS (CORS preflight)
results.push(await testFunction(
  "chat OPTIONS (CORS preflight)",
  `${BASE}/chat`,
  {
    method: "OPTIONS",
    headers: {
      "Origin": "http://localhost:8080",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  }
));

// 2. Chat - POST (real request)
results.push(await testFunction(
  "chat POST (real message)",
  `${BASE}/chat`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setor_slug: "metropolitana-c",
      bot_slug: "atendimento-metropolitana-c",
      canal_id: "9619a0b0-6ba6-4faa-8219-059318b230d3",
      session_id: "test-all-" + Date.now(),
      message: "oi",
    }),
  }
));

// 3. Chat - POST with invalid payload (should return 400)
results.push(await testFunction(
  "chat POST (invalid payload)",
  `${BASE}/chat`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invalid: true }),
  }
));

// 4. auth-google-start (without params, should return 400)
results.push(await testFunction(
  "auth-google-start (no params)",
  `${BASE}/auth-google-start`,
  { method: "GET" }
));

// 5. auth-google-callback (without params, should return 400)
results.push(await testFunction(
  "auth-google-callback (no params)",
  `${BASE}/auth-google-callback`,
  { method: "GET" }
));

// 6. widget (test if deployed)
results.push(await testFunction(
  "widget GET",
  `${BASE}/widget`,
  { method: "GET" }
));

// Summary
console.log(`\n${"=".repeat(60)}`);
console.log("SUMMARY");
console.log(`${"=".repeat(60)}`);
for (const r of results) {
  const icon = r.ok ? (r.status < 500 ? "✅" : "❌") : "❌";
  console.log(`${icon} ${r.name}: HTTP ${r.status} | CORS: ${r.cors ? "Yes" : "No"}`);
}
