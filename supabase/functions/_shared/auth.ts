// _shared/auth.ts — autorização das edge functions chamadas pelo CRM.
// Aceita: (a) usuário logado no CRM (JWT de sessão do Supabase Auth) ou
//         (b) chamada interna do pg_cron com header x-cron-secret igual ao
//             segredo guardado em crm_config (key = 'cron_secret').
// A chave anon sozinha NÃO é aceita: ela é pública (está no front-end) e
// permitia que qualquer pessoa disparasse notificações/consultas pagas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export async function authorize(req: Request): Promise<{ ok: boolean; via: string }> {
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret) {
    const { data } = await admin.from('crm_config').select('value').eq('key', 'cron_secret').maybeSingle();
    const esperado = (data?.value as any)?.secret;
    return esperado && esperado === cronSecret ? { ok: true, via: 'cron' } : { ok: false, via: 'cron-secret-invalido' };
  }
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, via: 'sem-token' };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, via: 'token-invalido' };
  return { ok: true, via: 'user:' + (data.user.email || data.user.id) };
}

export function unauthorized(via: string): Response {
  return new Response(JSON.stringify({ ok: false, error: 'NAO_AUTORIZADO', via }), {
    status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
