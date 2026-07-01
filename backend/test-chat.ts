import { createClient } from '@supabase/supabase-js';

const supabase = createClient('http://localhost:54321', 'mock-service-key');

async function run() {
  const { data: setor } = await supabase.from('setores').select('*').limit(1).single();
  const { data: bot } = await supabase.from('bots_agendamento').select('*').limit(1).single();
  const { data: canal } = await supabase.from('canais_widget').select('*').limit(1).single();
  
  if (!setor || !bot || !canal) {
    console.error("Missing data in Supabase:", { setor, bot, canal });
    return;
  }
  
  const payload = {
    setor_slug: setor.slug,
    bot_slug: bot.slug,
    canal_id: canal.id,
    session_id: "test-session-123",
    message: "Olá, quero agendar um atendimento.",
    user: {
      name: "Teste User",
      email: "teste@example.com"
    }
  };

  console.log("PAYLOAD:", JSON.stringify(payload, null, 2));

  try {
    const res = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const text = await res.text();
    console.log("STATUS:", res.status);
    console.log("RESPONSE:", text);
  } catch(e) {
    console.error("Error making request:", e);
  }
}

run();
