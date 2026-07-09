import fs from 'fs';
let content = fs.readFileSync('supabase/functions/chat/index.ts', 'utf8');

// Update corsHeaders
content = content.replace(
  /const corsHeaders = \{[\s\S]*?\};/,
  'const corsHeaders = {\n  "Access-Control-Allow-Origin": "*",\n  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",\n  "Access-Control-Allow-Methods": "POST, OPTIONS",\n};'
);

// Change export default { fetch(request: Request) { ... } }; to Deno.serve(async (request: Request) => { ... });
content = content.replace(
  /export default \{\s*async fetch\(request:\s*Request\)\s*\{/,
  'Deno.serve(async (request: Request) => {'
);
content = content.replace(/\}\s*\}\s*;\s*$/, '});\n');

// Replace all plain object returns in the route with Response wrapper
// We look for 'return {\n' followed by properties like 'reply:', 'conversation_id:', etc.
// The regex finds return objects that contain 'reply:' and 'status:'
const objectReturnRegex = /return\s+(\{\s*reply:\s*[\s\S]*?status:\s*[\"'](ok|error|timeout)[\"']\s*,?\s*\});/g;

content = content.replace(objectReturnRegex, (match, p1) => {
  return `return new Response(JSON.stringify(${p1}), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });`;
});

// Fix any 502/504 status code that might be forced to 200 by the regex above (wait, n8n webhook returns already use Response, so they are not matched because they don't start with "return {", they start with "return new Response"). The regex only matches raw objects. Let's double check.
fs.writeFileSync('supabase/functions/chat/index.ts', content);
console.log('Fixed chat/index.ts');
