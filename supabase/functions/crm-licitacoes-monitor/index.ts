// crm-licitacoes-monitor v11 — Agente diário de licitações PNCP
// (espelho do código publicado no Supabase — fonte da verdade é o deploy)
// Correções v11: parâmetro uf= (antes ufSigla= — busca vinha sem filtro de
// estado), links de edital no formato correto, matching por palavra inteira
// com acentos normalizados e pontuação de relevância, mais páginas por combo.
// Mantém: config via crm_config, e-mail Resend, Telegram, alertas de encerramento.
// Agendamento: pg_cron job "bikows-licitacoes-monitor" — diário 10:00 UTC (07:00 BRT)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const MODALIDADES = [4, 6, 8]; // Concorrência Eletrônica, Pregão Eletrônico, Dispensa Eletrônica
const PAGINAS_MAX = 3;
const TAMANHO_PAGINA = 50;
const DIAS_JANELA = 3;

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function formataData(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// numeroControlePNCP "07854402000100-1-000123/2026" → link real do edital
function linkEdital(numeroControle: string): string {
  const m = /^(\d{14})-1-(\d+)\/(\d{4})$/.exec(numeroControle || '');
  if (!m) return 'https://pncp.gov.br/app/editais?q=' + encodeURIComponent(numeroControle || '');
  return `https://pncp.gov.br/app/editais/${m[1]}/${m[3]}/${parseInt(m[2])}`;
}

async function getConfig() {
  const { data } = await supabase.from('crm_config').select('*');
  const cfg: Record<string, any> = {};
  (data || []).forEach((r: any) => { cfg[r.key] = r.value; });
  return cfg;
}

async function fetchCombo(uf: string, modalidade: number, dataInicial: string, dataFinal: string): Promise<any[]> {
  const resultados: any[] = [];
  for (let pagina = 1; pagina <= PAGINAS_MAX; pagina++) {
    const url = [
      'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao',
      `?dataInicial=${dataInicial}&dataFinal=${dataFinal}`,
      `&codigoModalidadeContratacao=${modalidade}`,
      `&uf=${uf}`,
      `&tamanhoPagina=${TAMANHO_PAGINA}&pagina=${pagina}`
    ].join('');
    try {
      const resp = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Bikows-CRM/1.1' },
        signal: AbortSignal.timeout(10000)
      });
      if (!resp.ok) break;
      const json = await resp.json();
      const items: any[] = json.data || [];
      resultados.push(...items);
      if (pagina >= (json.totalPaginas || 1)) break;
    } catch {
      break;
    }
  }
  return resultados;
}

// Pontuação: palavra-chave específica (composta, longa ou NR-xx) vale 2;
// genérica curta (ART, CREA, PGR...) vale 1. Entra com score >= 2.
// Matching por palavra inteira com acentos normalizados — "ART" não casa
// mais dentro de "participação".
function montarRegex(palavras: string[]): Array<[RegExp, number, string]> {
  return palavras.map((p) => {
    const kw = norm(p.trim());
    if (!kw) return null;
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const peso = (kw.includes(' ') || kw.length >= 8 || /^nr[- ]?\d/.test(kw)) ? 2 : 1;
    return [new RegExp(`\\b${esc}\\b`), peso, p] as [RegExp, number, string];
  }).filter(Boolean) as Array<[RegExp, number, string]>;
}

function filtrarLicitacoes(items: any[], regexes: Array<[RegExp, number, string]>, estados: string[], valorMinimo: number): any[] {
  const out: any[] = [];
  for (const item of items) {
    const uf = item.unidadeOrgao?.ufSigla || '';
    if (estados.length > 0 && !estados.includes(uf)) continue;
    const valor = item.valorTotalEstimado || item.valorTotalHomologado || 0;
    if (valorMinimo > 0 && valor > 0 && valor < valorMinimo) continue;
    const texto = norm([item.objetoCompra || '', item.informacaoComplementar || ''].join(' '));
    let score = 0; const hits: string[] = [];
    for (const [re, peso, kw] of regexes) {
      if (re.test(texto)) { score += peso; hits.push(kw); }
    }
    if (score >= 2) { item._score = score; item._hits = hits; out.push(item); }
  }
  return out;
}

async function salvarNovos(filtradas: any[]): Promise<any[]> {
  if (filtradas.length === 0) return [];
  const idOf = (f: any) => f.numeroControlePNCP || `${f.orgaoEntidade?.cnpj}-${f.sequencialCompra}`;
  const ids = filtradas.map(idOf);
  const { data: existentes } = await supabase.from('crm_licitacoes').select('id').in('id', ids);
  const existentesSet = new Set((existentes || []).map((e: any) => e.id));
  const novas = filtradas.filter(f => !existentesSet.has(idOf(f)));
  if (novas.length === 0) return [];
  const registros = novas.map(f => ({
    id: idOf(f),
    data: {
      titulo: (f.objetoCompra || 'Sem descrição').substring(0, 300),
      orgao: f.unidadeOrgao?.nomeUnidade || f.orgaoEntidade?.razaoSocial || '',
      uf: f.unidadeOrgao?.ufSigla || '',
      municipio: f.unidadeOrgao?.municipioNome || '',
      modalidade: f.modalidadeNome || '',
      valor: f.valorTotalEstimado || f.valorTotalHomologado || 0,
      dataPublicacao: f.dataPublicacaoPncp || f.dataInclusao || '',
      dataEncerramento: f.dataEncerramentoProposta || '',
      numero: f.numeroCompra || String(f.sequencialCompra),
      numeroControlePNCP: f.numeroControlePNCP || '',
      linkPNCP: linkEdital(f.numeroControlePNCP || ''),
      relevancia: f._score || 0,
      palavrasChave: f._hits || [],
      status: 'nova',
      kanban: 'nova'
    }
  }));
  const { error } = await supabase.from('crm_licitacoes').insert(registros);
  if (error) console.error('Erro ao inserir:', error.message);
  return registros;
}

async function enviarEmail(novas: any[], emailDestinatarios: string[], emailFrom: string): Promise<boolean> {
  if (!RESEND_API_KEY || novas.length === 0 || emailDestinatarios.length === 0) return false;
  const ordenadas = [...novas].sort((a, b) => (b.data?.valor || 0) - (a.data?.valor || 0));
  const linhas = ordenadas.slice(0, 15).map(n => {
    const link = n.data?.linkPNCP || '';
    const valor = n.data?.valor ? `R$ ${Number(n.data.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'N/I';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px">${n.data?.orgao || ''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;white-space:nowrap">${n.data?.uf} • ${n.data?.municipio}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px">${(n.data?.titulo || '').substring(0, 120)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;white-space:nowrap">${valor}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;font-size:12px">${link ? `<a href="${link}" style="color:#1D4F8C">Ver edital</a>` : ''}</td>
    </tr>`;
  }).join('');
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto">
    <div style="background:#0B1B33;color:white;padding:20px;border-radius:8px 8px 0 0">
      <h2 style="margin:0">🏛️ ${novas.length} nova(s) licitação(ões) de engenharia</h2>
      <p style="margin:5px 0 0;opacity:0.8">Bikows CRM — Monitor PNCP automático</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:0">
      <thead><tr style="background:#f0f4f8">
        <th style="padding:10px;text-align:left;font-size:12px">Órgão</th>
        <th style="padding:10px;text-align:left;font-size:12px">Local</th>
        <th style="padding:10px;text-align:left;font-size:12px">Objeto</th>
        <th style="padding:10px;text-align:left;font-size:12px">Valor Est.</th>
        <th style="padding:10px;text-align:left;font-size:12px">Link</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    ${novas.length > 15 ? `<p style="padding:10px;color:#666">...e mais ${novas.length - 15} licitações. Acesse o CRM para ver todas.</p>` : ''}
    <div style="background:#f8fafc;padding:15px;border-top:1px solid #e2e8f0;font-size:11px;color:#666">
      Gerado automaticamente pelo Bikows CRM — <a href="https://bikowsengenharia.github.io/BIKOWS-CRM/">Acessar CRM</a>
    </div>
  </div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: emailFrom,
        to: emailDestinatarios,
        subject: `🏛️ ${novas.length} licitação(ões) de engenharia — PNCP`,
        html
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function notificarTelegramNovas(novas: any[], telegramCfg: any) {
  const token = TELEGRAM_BOT_TOKEN || telegramCfg?.token;
  if (!token || !telegramCfg?.chatId || novas.length === 0) return;
  const top = [...novas].sort((a, b) => (b.data?.valor || 0) - (a.data?.valor || 0)).slice(0, 3);
  const fmtBRL = (v: number) => 'R$ ' + (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const linhas = top.map(n => {
    const d = n.data || {};
    const enc = d.dataEncerramento ? new Date(d.dataEncerramento) : null;
    const dias = enc ? Math.max(0, Math.ceil((enc.getTime() - Date.now()) / 86400000)) : null;
    return `• ${fmtBRL(d.valor)} — ${(d.titulo || '').slice(0, 90)}…\n  ${d.municipio}/${d.uf}${dias !== null ? ` · encerra em ${dias}d` : ''}\n  ${d.linkPNCP}`;
  }).join('\n\n');
  const msg = `🏛 *PNCP Monitor — ${novas.length} licitação(ões) nova(s)*\n\n${linhas}\n\n_Veja todas no CRM → Licitações → PNCP Monitor_`;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(telegramCfg.chatId), text: msg, parse_mode: 'Markdown', disable_web_page_preview: true })
    });
  } catch (e) { console.error('telegram novas erro', e); }
}

async function alertarEncerramentoProximo(telegramCfg: any): Promise<number> {
  const token = TELEGRAM_BOT_TOKEN || telegramCfg?.token;
  if (!telegramCfg?.chatId || !token) return 0;

  const hoje = new Date();
  const hojeFmt = hoje.toISOString().slice(0, 10);
  const em3Dias = new Date(hoje);
  em3Dias.setDate(em3Dias.getDate() + 3);
  const em3Fmt = em3Dias.toISOString().slice(0, 10);

  const { data: licitacoes } = await supabase.from('crm_licitacoes').select('id, data');

  const proximas = (licitacoes || []).filter(l => {
    const kanban = l.data?.kanban || '';
    if (!['nova', 'analisando', 'proposta', 'participar'].includes(kanban)) return false;
    const enc = (l.data?.dataEncerramento || '').slice(0, 10);
    if (!enc) return false;
    return enc >= hojeFmt && enc <= em3Fmt;
  });

  for (const lic of proximas) {
    const d = lic.data || {};
    const enc = (d.dataEncerramento || '').slice(0, 10);
    const diasRestantes = Math.ceil((new Date(enc).getTime() - hoje.getTime()) / 86400000);
    const valor = d.valor ? `R$ ${Number(d.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Valor não informado';
    const msg = [
      `⚠️ *Licitação encerrando em ${diasRestantes} dia(s)!*`,
      `📋 ${(d.titulo || 'Sem título').substring(0, 100)}`,
      `🏢 ${d.orgao || ''} — ${d.uf || ''}`,
      `💰 ${valor}`,
      `📅 Encerramento: ${enc}`,
      d.linkPNCP ? `🔗 ${d.linkPNCP}` : ''
    ].filter(Boolean).join('\n');
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: String(telegramCfg.chatId), text: msg, parse_mode: 'Markdown' })
      });
    } catch (e) { console.error('telegram alerta erro', e); }
  }
  return proximas.length;
}

Deno.serve(async (_req: Request) => {
  try {
    const config = await getConfig();
    const monitorCfg = config.licitacoes_monitor || {};
    const notifCfg = config.notificacoes || {};
    const telegramCfg = config.telegram || {};

    if (!monitorCfg.ativo) {
      return new Response(JSON.stringify({ ok: true, msg: 'Monitor desativado' }), { headers: { 'Content-Type': 'application/json' } });
    }

    const estados: string[] = monitorCfg.estados || ['PR', 'SC', 'SP'];
    const palavras: string[] = monitorCfg.palavrasChave || [];
    const valorMinimo: number = monitorCfg.valorMinimo || 0;
    const regexes = montarRegex(palavras);

    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - DIAS_JANELA);
    const dataFinal = formataData(hoje);
    const dataInicial = formataData(inicio);

    const todos: any[] = [];
    const vistos = new Set<string>();

    for (const uf of estados) {
      for (const mod of MODALIDADES) {
        const items = await fetchCombo(uf, mod, dataInicial, dataFinal);
        for (const item of items) {
          const key = item.numeroControlePNCP || `${item.orgaoEntidade?.cnpj}-${item.sequencialCompra}`;
          if (!vistos.has(key)) { vistos.add(key); todos.push(item); }
        }
      }
    }

    const filtradas = filtrarLicitacoes(todos, regexes, estados, valorMinimo);
    const novas = await salvarNovos(filtradas);

    let emailSent = false;
    if (novas.length > 0) {
      emailSent = await enviarEmail(novas, notifCfg.emailDestinatarios || [], notifCfg.emailFrom || 'CRM Bikows <onboarding@resend.dev>');
      await notificarTelegramNovas(novas, telegramCfg);
    }

    const alertasEnviados = await alertarEncerramentoProximo(telegramCfg);

    return new Response(JSON.stringify({
      ok: true,
      periodo: `${dataInicial} a ${dataFinal}`,
      totalPNCP: todos.length,
      filtradas: filtradas.length,
      novas: novas.length,
      emailSent,
      alertasEncerramentoProximo: alertasEnviados
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
