import { supabaseAdmin } from './src/supabase';

async function main() {
  const columns = [
    'telefone', 'external_event_id', 'google_event_id'
  ];
  
  for (const col of columns) {
    const { error } = await supabaseAdmin.from('agendamentos').select(col).limit(1);
    if (error) {
      console.log(`Column ${col} DOES NOT exist:`, error.message);
    } else {
      console.log(`Column ${col} exists.`);
    }
  }
}

main();
