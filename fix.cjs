const fs = require('fs');
const file = 'supabase/functions/chat/index.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/error: any/g, 'error: { code: string } | null');
content = content.replace(/logger: any/g, 'logger: typeof logger');
content = content.replace(/catch \(err: any\)/g, 'catch (err: unknown)');
content = content.replace(/err: err\.message/g, 'err: err instanceof Error ? err.message : String(err)');
content = content.replace(/err\.name === "TimeoutError"/g, '(err instanceof Error ? err.name : "") === "TimeoutError"');
content = content.replace(/err\.name === "AbortError"/g, '(err instanceof Error ? err.name : "") === "AbortError"');
content = content.replace(/name: err\.name/g, 'name: err instanceof Error ? err.name : "UnknownError"');
content = content.replace(/l: any/g, 'l: Record<string, unknown>');
content = content.replace(/a: any/g, 'a: Record<string, unknown>');
content = content.replace(/j: any/g, 'j: Record<string, unknown>');
content = content.replace(/c: any/g, 'c: Record<string, unknown>');
content = content.replace(/att as any/g, 'att as Record<string, unknown>');
content = content.replace(/avail\.calendarios\[0\] as any/g, 'avail.calendarios[0] as Record<string, unknown>');
content = content.replace(/exc as any/g, 'exc as Record<string, unknown>');
content = content.replace(/apt as any/g, 'apt as Record<string, unknown>');
content = content.replace(/janela as any/g, 'janela as Record<string, unknown>');
content = content.replace(/canal as any/g, 'canal as Record<string, unknown>');

// Fix string cast where property access happens
content = content.replace(/l\.atendente_id/g, 'l.atendente_id as string');
content = content.replace(/a\.id/g, 'a.id as string');
content = content.replace(/attendantIds\.has\(j\.atendente_id\)/g, 'attendantIds.has(j.atendente_id as string)');
content = content.replace(/\(conversationState\.horario_selecionado as any\)\.inicio/g, '(conversationState.horario_selecionado as Record<string, unknown>).inicio as string');

content = content.replace(/\(conversationState\.dados_coletados as any\)\.nome_completo/g, '(conversationState.dados_coletados as Record<string, unknown>).nome_completo as string');
content = content.replace(/\(conversationState\.dados_coletados as any\)\.nome/g, '(conversationState.dados_coletados as Record<string, unknown>).nome as string');
content = content.replace(/\(conversationState\.dados_coletados as any\)\.email/g, '(conversationState.dados_coletados as Record<string, unknown>).email as string');

content = content.replace(/\) as any/g, ') as Record<string, unknown> | undefined');

fs.writeFileSync(file, content);
console.log('Fixed');
