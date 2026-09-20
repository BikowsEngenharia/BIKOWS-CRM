// Edge Function: crm-notificacoes-eventos
// Disparada pelo CRM em eventos (lead novo, proposta aprovada/reprovada...)
// e envia Telegram + e-mail (Resend).
// v5: autorização obrigatória (usuário logado ou x-cron-secret) + CORS
//     (antes qualquer pessoa com a chave anon pública disparava mensagens,
//      e o navegador nem conseguia chamar por falta de preflight OPTIONS).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// ---- Autorização (cópia de _shared/auth.ts) ----
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const JSON_H = { ...CORS, 'Content-Type': 'application/json' };

async function authorize(req: Request): Promise<{ ok: boolean; via: string }> {
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret) {
    const { data } = await supabase.from('crm_config').select('value').eq('key', 'cron_secret').maybeSingle();
    const esperado = (data?.value as any)?.secret;
    return esperado && esperado === cronSecret ? { ok: true, via: 'cron' } : { ok: false, via: 'cron-secret-invalido' };
  }
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, via: 'sem-token' };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { ok: false, via: 'token-invalido' };
  return { ok: true, via: 'user:' + (data.user.email || data.user.id) };
}

function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function getConfig() {
  const { data } = await supabase.from('crm_config').select('key, value').in('key', ['telegram', 'notificacoes']);
  const cfg: Record<string, any> = {};
  (data || []).forEach((r: any) => { cfg[r.key] = r.value; });
  return cfg;
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendEmail(to: string[], from: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY || to.length === 0) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html })
    });
    return res.ok;
  } catch {
    return false;
  }
}

type Evento = 'lead_novo' | 'proposta_aprovada' | 'proposta_reprovada' | 'pagamento_recebido' | 'projeto_concluido';
const EVENTOS: Evento[] = ['lead_novo', 'proposta_aprovada', 'proposta_reprovada', 'pagamento_recebido', 'projeto_concluido'];

function montarMensagemTelegram(evento: Evento, dados: Record<string, any>): string {
  const valor = dados.valor ? `R$ ${fmt(Number(dados.valor))}` : '';
  switch (evento) {
    case 'lead_novo':
      return [
        '🔵 *Novo Lead!*',
        dados.nome || dados.empresa || 'Lead',
        valor ? `💰 ${valor}` : '',
        dados.servico ? `📋 ${dados.servico}` : '',
        dados.origem ? `📌 Origem: ${dados.origem}` : ''
      ].filter(Boolean).join('\n');

    case 'proposta_aprovada':
      return [
        '✅ *Proposta Aprovada!*',
        dados.cliente || dados.nome || 'Cliente',
        valor ? `💰 ${valor}` : '',
        dados.numero ? `📄 Proposta nº ${dados.numero}` : '',
        'Próximo passo: criar contrato'
      ].filter(Boolean).join('\n');

    case 'proposta_reprovada':
      return [
        '❌ *Proposta Reprovada*',
        dados.cliente || dados.nome || 'Cliente',
        valor ? `💰 ${valor}` : '',
        dados.motivo ? `Motivo: ${dados.motivo}` : ''
      ].filter(Boolean).join('\n');

    case 'pagamento_recebido':
      return [
        '💵 *Pagamento Recebido!*',
        dados.cliente || dados.nome || 'Cliente',
        valor ? `💰 ${valor}` : '',
        dados.referencia ? `📋 Ref: ${dados.referencia}` : '',
        dados.data ? `📅 Data: ${dados.data}` : ''
      ].filter(Boolean).join('\n');

    case 'projeto_concluido':
      return [
        '🎉 *Projeto Concluído!*',
        dados.nome || dados.titulo || 'Projeto',
        dados.cliente ? `👤 Cliente: ${dados.cliente}` : '',
        valor ? `💰 Valor: ${valor}` : '',
        dados.prazo ? `📅 Prazo: ${dados.prazo}` : ''
      ].filter(Boolean).join('\n');

    default:
      return `📢 *Evento CRM*\n${JSON.stringify(dados)}`;
  }
}

function montarSubjectEmail(evento: Evento, dados: Record<string, any>): string {
  switch (evento) {
    case 'lead_novo': return `🔵 Novo Lead: ${dados.nome || dados.empresa || 'Lead'}`;
    case 'proposta_aprovada': return `✅ Proposta Aprovada: ${dados.cliente || 'Cliente'}`;
    case 'proposta_reprovada': return `❌ Proposta Reprovada: ${dados.cliente || 'Cliente'}`;
    case 'pagamento_recebido': return `💵 Pagamento Recebido: ${dados.cliente || 'Cliente'}`;
    case 'projeto_concluido': return `🎉 Projeto Concluído: ${dados.nome || 'Projeto'}`;
    default: return `Evento CRM: ${evento}`;
  }
}

function montarHtmlEmail(evento: Evento, dados: Record<string, any>): string {
  // Texto vira HTML escapado (dados vêm do CRM, mas e-mail não deve interpretar HTML do usuário)
  const texto = montarMensagemTelegram(evento, dados)
    .replace(/\*/g, '')
    .split('\n')
    .map(l => `<p style="margin:4px 0">${esc(l)}</p>`)
    .join('');
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#0B1B33;color:white;padding:20px;border-radius:8px 8px 0 0">
      <h2 style="margin:0">Bikows CRM — Notificação</h2>
    </div>
    <div style="padding:20px;background:#f8fafc">${texto}</div>
    <div style="background:#e2e8f0;padding:12px;font-size:11px;color:#666;border-radius:0 0 8px 8px">
      <a href="https://bikowsengenharia.github.io/BIKOWS-CRM/">Acessar CRM</a>
    </div>
  </div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método não permitido' }), { status: 405, headers: JSON_H });
  }

  const auth = await authorize(req);
  if (!auth.ok) {
    console.warn('[eventos] recusado:', auth.via);
    return new Response(JSON.stringify({ ok: false, error: 'NAO_AUTORIZADO', via: auth.via }), { status: 401, headers: JSON_H });
  }

  try {
    const body = await req.json();
    const { evento, dados = {} } = body as { evento: Evento; dados: Record<string, any> };

    if (!evento || !EVENTOS.includes(evento)) {
      return new Response(JSON.stringify({ ok: false, error: 'Campo "evento" inválido' }), { status: 400, headers: JSON_H });
    }

    const config = await getConfig();
    const notifCfg = config.notificacoes || {};
    const telegramCfg = config.telegram || {};

    const resultados: Record<string, any> = { evento, via: auth.via };

    // Notificação Telegram
    if (notifCfg.telegram !== false && telegramCfg.chatId) {
      const msgTelegram = montarMensagemTelegram(evento, dados);
      resultados.telegram = await sendTelegram(String(telegramCfg.chatId), msgTelegram);
    } else {
      resultados.telegram = false;
    }

    // Notificação Email via Resend
    const destinatarios: string[] = notifCfg.emailDestinatarios || [];
    if (destinatarios.length > 0) {
      const subject = montarSubjectEmail(evento, dados);
      const html = montarHtmlEmail(evento, dados);
      const from = notifCfg.emailFrom || 'CRM Bikows <onboarding@resend.dev>';
      resultados.email = await sendEmail(destinatarios, from, subject, html);
    } else {
      resultados.email = false;
    }

    return new Response(JSON.stringify({ ok: true, ...resultados }), { headers: JSON_H });

  } catch (err: any) {
    console.error('Erro na notificação:', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: JSON_H });
  }
});
