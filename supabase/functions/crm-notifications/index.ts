import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

/* ---- Credenciais ---- */
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY') ?? ''
const EMAIL_TO     = Deno.env.get('NOTIF_EMAIL_TO')   ?? 'contato@bikows.com.br'
const EMAIL_FROM   = Deno.env.get('NOTIF_EMAIL_FROM') ?? 'CRM Bikows <onboarding@resend.dev>'
// v9: token do Telegram vem do secret TELEGRAM_BOT_TOKEN (igual às outras
// functions) — com fallback para o valor antigo para não interromper o digest.
const TG_TOKEN     = Deno.env.get('TELEGRAM_BOT_TOKEN') || '8781557399:AAFT7HyJxltfr2XpPpmC1oD2Z33kJDJE4rk'
const TG_CHAT_ID   = Deno.env.get('TELEGRAM_CHAT_ID') || '8675223922'
const CRM_URL      = 'https://bikowsengenharia.github.io/BIKOWS-CRM/'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

/* ---- Autorização (cópia de _shared/auth.ts) ----
   Aceita usuário logado no CRM (JWT de sessão) ou pg_cron com x-cron-secret.
   A chave anon sozinha não é aceita: é pública e permitia disparar digests. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_H = { ...CORS, 'Content-Type': 'application/json' }
async function authorize(req: Request): Promise<{ ok: boolean; via: string }> {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret) {
    const { data } = await admin.from('crm_config').select('value').eq('key', 'cron_secret').maybeSingle()
    const esperado = (data?.value as any)?.secret
    return esperado && esperado === cronSecret ? { ok: true, via: 'cron' } : { ok: false, via: 'cron-secret-invalido' }
  }
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, via: 'sem-token' }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return { ok: false, via: 'token-invalido' }
  return { ok: true, via: 'user:' + (data.user.email || data.user.id) }
}

/* ---- Utilitários ---- */
function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const d    = new Date(dateStr + 'T00:00:00'); d.setHours(0,0,0,0)
  return Math.round((d.getTime() - hoje.getTime()) / 86400000)
}
function fmtCurrency(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function esc(s: string): string {
  // Escapa caracteres problemáticos no HTML do Telegram / e-mail
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
function labelAtraso(d: number | null): string {
  if (d === null) return ''
  if (d < 0) return ` <i>(${Math.abs(d)}d atrasado)</i>`
  if (d === 0) return ' <i>(HOJE)</i>'
  if (d === 1) return ' <i>(amanhã)</i>'
  return ` <i>(em ${d}d)</i>`
}

/* ================================================================
   TELEGRAM
   ================================================================ */
async function sendTelegram(text: string): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT_ID) return
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
  } catch (e) {
    console.warn('[TG] Erro:', e)
  }
}

function buildTelegramDaily(
  atividades: any[], leads: any[], recebiveis: any[],
  contasPagar: any[], licitacoes: any[], projetos: any[],
  hojeStr: string
): string {
  const hoje = new Date()
  const dataFmt = hoje.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' })

  // Atividades atrasadas e de hoje/amanhã
  const atvsAtrasadas = atividades.filter(a =>
    a.status === 'pendente' && a.data && (daysUntil(a.data) ?? 0) < 0
  ).sort((a, b) => (a.data || '').localeCompare(b.data || ''))
  const atvsHoje = atividades.filter(a =>
    a.status === 'pendente' && a.data &&
    (daysUntil(a.data) ?? 99) >= 0 && (daysUntil(a.data) ?? 99) <= 1
  ).sort((a, b) => (a.data || '').localeCompare(b.data || ''))

  // Follow-ups vencidos
  const followups = leads.filter(l =>
    !['fechado_ganho','executado','fechado_perdido'].includes(l.status) &&
    l.dataProximaAcao && (daysUntil(l.dataProximaAcao) ?? 1) <= 0
  ).sort((a, b) => (a.dataProximaAcao || '').localeCompare(b.dataProximaAcao || ''))

  // Parcelas vencendo em 3 dias
  const parcelasAlerta: any[] = []
  recebiveis.forEach(r => (r.parcelas || []).forEach((p: any) => {
    const d = daysUntil(p.vencimento)
    if (p.status !== 'recebido' && d !== null && d <= 3 && d >= -30)
      parcelasAlerta.push({ ...p, _clienteNome: r.cliente || r.titulo || r.descricao || '—' })
  }))
  parcelasAlerta.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''))

  // Contas a pagar vencendo em 3 dias
  const contasAlerta = contasPagar.filter(c =>
    c.status === 'pendente' && c.vencimento &&
    (daysUntil(c.vencimento) ?? 1) <= 3 && (daysUntil(c.vencimento) ?? 1) >= -30
  ).sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''))

  // Licitações abrindo em ≤3 dias
  const licsAlerta = licitacoes.filter(l =>
    !['ganhou','perdeu','deserta','cancelada','descartada'].includes(l.status) &&
    l.dataAbertura && (daysUntil(l.dataAbertura) ?? -1) >= 0 && (daysUntil(l.dataAbertura) ?? 99) <= 3
  )

  // Projetos sem ART
  const semART = projetos.filter(p => p.status === 'em_andamento' && !p.art?.numero)

  const MAX = 5 // máximo de itens por seção no Telegram
  const partes: string[] = []

  if (atvsAtrasadas.length) {
    partes.push(`⚠️ <b>Atividades atrasadas (${atvsAtrasadas.length})</b>`)
    atvsAtrasadas.slice(0, MAX).forEach(a => {
      partes.push(`  • ${esc(a.titulo || '—')}${labelAtraso(daysUntil(a.data))}${a.responsavel ? ' — ' + esc(a.responsavel) : ''}`)
    })
    if (atvsAtrasadas.length > MAX) partes.push(`  <i>... e mais ${atvsAtrasadas.length - MAX}</i>`)
  }

  if (followups.length) {
    partes.push(`\n💼 <b>Follow-ups vencidos (${followups.length})</b>`)
    followups.slice(0, MAX).forEach(l => {
      const acao = l.proximaAcao ? esc(l.proximaAcao) : 'Verificar pipeline'
      partes.push(`  • ${esc(l.titulo || l.cliente || '—')} — ${acao}${labelAtraso(daysUntil(l.dataProximaAcao))}`)
    })
    if (followups.length > MAX) partes.push(`  <i>... e mais ${followups.length - MAX}</i>`)
  }

  if (atvsHoje.length) {
    partes.push(`\n📋 <b>Atividades hoje/amanhã (${atvsHoje.length})</b>`)
    atvsHoje.slice(0, MAX).forEach(a => {
      partes.push(`  • ${esc(a.titulo || '—')}${labelAtraso(daysUntil(a.data))}${a.responsavel ? ' — ' + esc(a.responsavel) : ''}`)
    })
    if (atvsHoje.length > MAX) partes.push(`  <i>... e mais ${atvsHoje.length - MAX}</i>`)
  }

  if (parcelasAlerta.length) {
    partes.push(`\n💰 <b>Parcelas a receber (${parcelasAlerta.length})</b>`)
    parcelasAlerta.slice(0, MAX).forEach(p => {
      partes.push(`  • ${esc(p._clienteNome)} — ${fmtCurrency(p.valor || 0)} · venc. ${fmtDate(p.vencimento)}${labelAtraso(daysUntil(p.vencimento))}`)
    })
    if (parcelasAlerta.length > MAX) partes.push(`  <i>... e mais ${parcelasAlerta.length - MAX}</i>`)
  }

  if (contasAlerta.length) {
    partes.push(`\n💸 <b>Contas a pagar (${contasAlerta.length})</b>`)
    contasAlerta.slice(0, MAX).forEach(c => {
      partes.push(`  • ${esc(c.fornecedor || c.descricao || '—')} — ${fmtCurrency(c.valor || 0)} · venc. ${fmtDate(c.vencimento)}${labelAtraso(daysUntil(c.vencimento))}`)
    })
    if (contasAlerta.length > MAX) partes.push(`  <i>... e mais ${contasAlerta.length - MAX}</i>`)
  }

  if (licsAlerta.length) {
    partes.push(`\n🏛 <b>Licitações abrindo em breve (${licsAlerta.length})</b>`)
    licsAlerta.slice(0, MAX).forEach(l => {
      partes.push(`  • ${esc(l.orgao || l.numero || '—')} · abertura ${fmtDate(l.dataAbertura)}${labelAtraso(daysUntil(l.dataAbertura))}`)
    })
  }

  if (semART.length) {
    partes.push(`\n📜 <b>Projetos sem ART (${semART.length})</b>`)
    semART.slice(0, MAX).forEach(p => {
      partes.push(`  • ${esc(p.titulo || '—')}${p.cliente ? ' — ' + esc(p.cliente) : ''}`)
    })
    if (semART.length > MAX) partes.push(`  <i>... e mais ${semART.length - MAX}</i>`)
  }

  if (partes.length === 0) {
    return `✅ <b>Bikows CRM</b> — ${dataFmt}\n\nTudo em dia! Nenhum alerta para hoje.\n\n<a href="${CRM_URL}">Acessar CRM</a>`
  }

  return `📋 <b>Bikows CRM — Resumo Diário</b>\n<i>${dataFmt}</i>\n\n${partes.join('\n')}\n\n<a href="${CRM_URL}">Acessar o CRM →</a>`
}

function buildTelegramWeekly(
  leads: any[], projetos: any[], licitacoes: any[], recebiveis: any[]
): string {
  const mesAtual = new Date().toISOString().slice(0,7)
  const hoje = new Date()
  const dataFmt = hoje.toLocaleDateString('pt-BR', { day:'numeric', month:'long', year:'numeric' })

  const ativos = leads.filter(l => !['fechado_ganho','executado','fechado_perdido'].includes(l.status))
  const ganhosMes = leads.filter(l => ['fechado_ganho','executado'].includes(l.status) && (l.dataMudancaStatus || l.dataEntrada || '').startsWith(mesAtual))
  const totalPipeline = ativos.reduce((s:number, l:any) => s + (l.valorEstimado || 0), 0)
  const receitaMes = ganhosMes.reduce((s:number, l:any) => s + (Number(l.valorFechado) || Number(l.valorEstimado) || 0), 0)

  const projetosAtivos = projetos.filter(p => p.status === 'em_andamento')
  const projetosAtrasados = projetosAtivos.filter(p => p.prazo && (daysUntil(p.prazo) ?? 0) < 0)
  const licsAtivas = licitacoes.filter(l => !['ganhou','perdeu','deserta','cancelada','descartada'].includes(l.status))

  let aReceber = 0, vencidos = 0
  recebiveis.forEach(r => (r.parcelas || []).forEach((p: any) => {
    if (p.status === 'recebido') return
    const d = daysUntil(p.vencimento)
    if (d !== null && d >= 0) aReceber += (p.valor || 0)
    else if (d !== null && d < 0) vencidos += (p.valor || 0)
  }))

  // Follow-ups que precisam de atenção esta semana
  const followupsSemana = leads.filter(l =>
    !['fechado_ganho','executado','fechado_perdido'].includes(l.status) &&
    l.dataProximaAcao && (daysUntil(l.dataProximaAcao) ?? 1) <= 7
  ).sort((a, b) => (a.dataProximaAcao || '').localeCompare(b.dataProximaAcao || ''))

  const LABELS: Record<string,string> = {
    lead_identificado: 'Lead',
    primeiro_contato: '1º Contato',
    qualificacao: 'Qualificação',
    proposta_elaboracao: 'Em Proposta',
    proposta_enviada: 'Proposta Enviada',
    negociacao: 'Negociação'
  }

  const partes: string[] = []
  partes.push(`📊 <b>Bikows CRM — Relatório Semanal</b>\n<i>${dataFmt}</i>`)

  // Resumo financeiro
  partes.push(`\n💼 <b>Comercial</b>`)
  partes.push(`  Pipeline: <b>${fmtCurrency(totalPipeline)}</b> (${ativos.length} leads ativos)`)
  partes.push(`  Receita no mês: <b>${fmtCurrency(receitaMes)}</b> (${ganhosMes.length} fechados)`)

  // Por estágio
  const estagios: Record<string,number> = {}
  ativos.forEach((l: any) => { estagios[l.status] = (estagios[l.status] || 0) + 1 })
  if (Object.keys(estagios).length) {
    const resumoEstagio = Object.entries(estagios)
      .map(([k, v]) => `${LABELS[k] || k}: ${v}`).join(' · ')
    partes.push(`  <i>${resumoEstagio}</i>`)
  }

  // Follow-ups da semana
  if (followupsSemana.length) {
    partes.push(`\n📞 <b>Follow-ups para esta semana (${followupsSemana.length})</b>`)
    followupsSemana.slice(0, 5).forEach(l => {
      const acao = l.proximaAcao ? esc(l.proximaAcao) : 'Verificar'
      partes.push(`  • ${esc(l.titulo || l.cliente || '—')} — ${acao} · ${fmtDate(l.dataProximaAcao)}${labelAtraso(daysUntil(l.dataProximaAcao))}`)
    })
    if (followupsSemana.length > 5) partes.push(`  <i>... e mais ${followupsSemana.length - 5}</i>`)
  }

  // Financeiro
  partes.push(`\n💰 <b>Financeiro</b>`)
  partes.push(`  A receber: <b>${fmtCurrency(aReceber)}</b>`)
  if (vencidos > 0) partes.push(`  ⚠️ Vencido: <b>${fmtCurrency(vencidos)}</b>`)

  // Projetos
  partes.push(`\n🔧 <b>Projetos</b>`)
  partes.push(`  ${projetosAtivos.length} em andamento${projetosAtrasados.length > 0 ? ` · ⚠️ ${projetosAtrasados.length} atrasado(s)` : ' · ✅ no prazo'}`)
  if (projetosAtrasados.length) {
    projetosAtrasados.slice(0, 3).forEach(p => {
      partes.push(`  • ${esc(p.titulo || '—')}${p.prazo ? ' · prazo ' + fmtDate(p.prazo) + labelAtraso(daysUntil(p.prazo)) : ''}`)
    })
  }

  // Licitações
  if (licsAtivas.length) {
    partes.push(`\n🏛 <b>Licitações ativas (${licsAtivas.length})</b>`)
    licsAtivas.slice(0, 3).forEach(l => {
      partes.push(`  • ${esc(l.orgao || l.numero || '—')}${l.dataAbertura ? ' · abertura ' + fmtDate(l.dataAbertura) : ''}`)
    })
    if (licsAtivas.length > 3) partes.push(`  <i>... e mais ${licsAtivas.length - 3}</i>`)
  }

  partes.push(`\n<a href="${CRM_URL}">Acessar o CRM →</a>`)

  return partes.join('\n')
}

function buildTelegramUrgent(
  atividades: any[], leads: any[], recebiveis: any[], contasPagar: any[]
): string | null {
  const atvsAtrasadas = atividades.filter(a =>
    a.status === 'pendente' && a.data && (daysUntil(a.data) ?? 0) < 0
  ).sort((a, b) => (a.data || '').localeCompare(b.data || ''))

  const followupsAtrasados = leads.filter(l =>
    !['fechado_ganho','executado','fechado_perdido'].includes(l.status) &&
    l.dataProximaAcao && (daysUntil(l.dataProximaAcao) ?? 0) < 0
  ).sort((a, b) => (a.dataProximaAcao || '').localeCompare(b.dataProximaAcao || ''))

  const parcelasVencidas: any[] = []
  recebiveis.forEach(r => (r.parcelas || []).forEach((p: any) => {
    if (p.status !== 'recebido' && (daysUntil(p.vencimento) ?? 0) < 0)
      parcelasVencidas.push({ ...p, _clienteNome: r.cliente || r.titulo || r.descricao || '—' })
  }))

  const contasVencidas = contasPagar.filter(c =>
    c.status === 'pendente' && (daysUntil(c.vencimento) ?? 0) < 0
  ).sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''))

  if (!atvsAtrasadas.length && !followupsAtrasados.length && !parcelasVencidas.length && !contasVencidas.length) return null

  const MAX = 5
  const partes: string[] = [`🚨 <b>ALERTA URGENTE — Bikows CRM</b>`]

  if (atvsAtrasadas.length) {
    partes.push(`\n📋 <b>Atividades atrasadas (${atvsAtrasadas.length})</b>`)
    atvsAtrasadas.slice(0, MAX).forEach(a => {
      partes.push(`  • ${esc(a.titulo || '—')}${labelAtraso(daysUntil(a.data))}${a.responsavel ? ' — ' + esc(a.responsavel) : ''}`)
    })
    if (atvsAtrasadas.length > MAX) partes.push(`  <i>... e mais ${atvsAtrasadas.length - MAX}</i>`)
  }

  if (followupsAtrasados.length) {
    partes.push(`\n💼 <b>Follow-ups em atraso (${followupsAtrasados.length})</b>`)
    followupsAtrasados.slice(0, MAX).forEach(l => {
      const acao = l.proximaAcao ? esc(l.proximaAcao) : 'Verificar pipeline'
      partes.push(`  • ${esc(l.titulo || l.cliente || '—')} — ${acao}${labelAtraso(daysUntil(l.dataProximaAcao))}`)
    })
    if (followupsAtrasados.length > MAX) partes.push(`  <i>... e mais ${followupsAtrasados.length - MAX}</i>`)
  }

  if (parcelasVencidas.length) {
    const totalVenc = parcelasVencidas.reduce((s: number, p: any) => s + (p.valor || 0), 0)
    partes.push(`\n💰 <b>Parcelas vencidas (${parcelasVencidas.length}) — ${fmtCurrency(totalVenc)}</b>`)
    parcelasVencidas.slice(0, MAX).forEach(p => {
      partes.push(`  • ${esc(p._clienteNome)} — ${fmtCurrency(p.valor || 0)} · venc. ${fmtDate(p.vencimento)}${labelAtraso(daysUntil(p.vencimento))}`)
    })
    if (parcelasVencidas.length > MAX) partes.push(`  <i>... e mais ${parcelasVencidas.length - MAX}</i>`)
  }

  if (contasVencidas.length) {
    partes.push(`\n💸 <b>Contas a pagar vencidas (${contasVencidas.length})</b>`)
    contasVencidas.slice(0, MAX).forEach(c => {
      partes.push(`  • ${esc(c.fornecedor || c.descricao || '—')} — ${fmtCurrency(c.valor || 0)} · venc. ${fmtDate(c.vencimento)}${labelAtraso(daysUntil(c.vencimento))}`)
    })
    if (contasVencidas.length > MAX) partes.push(`  <i>... e mais ${contasVencidas.length - MAX}</i>`)
  }

  partes.push(`\n<a href="${CRM_URL}">Ver agora →</a>`)
  return partes.join('\n')
}

/* ================================================================
   E-MAIL (Resend)
   ================================================================ */
const STYLE = `body{margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:640px;margin:0 auto;padding:24px 16px}.card{background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}.header{background:#0B1B33;border-radius:12px;padding:24px;margin-bottom:16px;text-align:center}.h-title{color:#fff;font-size:20px;font-weight:700;margin:8px 0 4px}.h-sub{color:#8FA0B5;font-size:13px;margin:0}.section-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin:0 0 12px}.item{display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid #f1f5f9}.item:last-child{border-bottom:none}.emoji{font-size:18px;line-height:1.4}.item-body{flex:1}.item-title{font-size:14px;font-weight:600;color:#0f172a;margin:0 0 2px}.item-sub{font-size:12px;color:#64748b;margin:0}.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}.badge-red{background:#fef2f2;color:#dc2626}.badge-yellow{background:#fefce8;color:#ca8a04}.badge-green{background:#f0fdf4;color:#16a34a}.footer{text-align:center;font-size:11px;color:#94a3b8;padding:16px 0 0}.btn{display:inline-block;background:#1D4F8C;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;font-size:13px;margin-top:12px}.ok-banner{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:12px}`

function labelDia(d: number|null): string {
  if (d===null) return ''
  if (d<0) return `<span class="badge badge-red">${Math.abs(d)}d atrasado</span>`
  if (d===0) return `<span class="badge badge-red">HOJE</span>`
  return `<span class="badge badge-yellow">em ${d}d</span>`
}

function buildDailyEmail(
  atividades: any[], leads: any[], recebiveis: any[],
  contasPagar: any[], licitacoes: any[], projetos: any[],
  hojeStr: string, urgentOnly: boolean
): string | null {
  const ant = urgentOnly ? 0 : 1
  const atvsAlerta = atividades.filter(a=>a.status==='pendente'&&a.data).filter(a=>{const d=daysUntil(a.data);return d!==null&&d<=ant&&d>=-30}).sort((a,b)=>(a.data||'').localeCompare(b.data||''))
  const followups  = leads.filter(l=>!['fechado_ganho','executado','fechado_perdido'].includes(l.status)&&l.dataProximaAcao).filter(l=>{const d=daysUntil(l.dataProximaAcao);return d!==null&&d<=ant&&d>=-30}).sort((a,b)=>(a.dataProximaAcao||'').localeCompare(b.dataProximaAcao||''))
  const parcelasAlerta:any[]=[]
  recebiveis.forEach(r=>(r.parcelas||[]).forEach((p:any)=>{if(p.status==='recebido')return;const d=daysUntil(p.vencimento);if(d!==null&&d<=(urgentOnly?0:3)&&d>=-30)parcelasAlerta.push(p)}))
  const contasAlerta = contasPagar.filter(c=>c.status==='pendente'&&c.vencimento).filter(c=>{const d=daysUntil(c.vencimento);return d!==null&&d<=(urgentOnly?0:3)&&d>=-30}).sort((a,b)=>(a.vencimento||'').localeCompare(b.vencimento||''))
  const licsAlerta   = licitacoes.filter(l=>!['ganhou','perdeu','deserta','cancelada','descartada'].includes(l.status)&&l.dataAbertura).filter(l=>{const d=daysUntil(l.dataAbertura);return d!==null&&d<=(urgentOnly?0:3)&&d>=0})
  const semART       = projetos.filter(p=>p.status==='em_andamento'&&!p.art?.numero)
  const total = atvsAlerta.length+followups.length+parcelasAlerta.length+contasAlerta.length+licsAlerta.length
  if (urgentOnly && total===0) return null
  const sA = atvsAlerta.length?`<div class="card"><p class="section-title">📋 Atividades (${atvsAlerta.length})</p>${atvsAlerta.map(a=>`<div class="item"><span class="emoji">📋</span><div class="item-body"><p class="item-title">${esc(a.titulo||'—')}</p><p class="item-sub">${fmtDate(a.data)} · ${esc(a.responsavel||'')} ${labelDia(daysUntil(a.data))}</p></div></div>`).join('')}</div>`:''
  const sF = followups.length?`<div class="card"><p class="section-title">💼 Follow-ups (${followups.length})</p>${followups.map(l=>`<div class="item"><span class="emoji">💼</span><div class="item-body"><p class="item-title">${esc(l.titulo||'—')}</p><p class="item-sub">${esc(l.proximaAcao||'Verificar pipeline')} · ${fmtDate(l.dataProximaAcao)} ${labelDia(daysUntil(l.dataProximaAcao))}</p></div></div>`).join('')}</div>`:''
  const sP = parcelasAlerta.length?`<div class="card"><p class="section-title">💰 Parcelas a Receber (${parcelasAlerta.length})</p>${parcelasAlerta.map(p=>`<div class="item"><span class="emoji">💰</span><div class="item-body"><p class="item-title">${fmtCurrency(p.valor||0)}</p><p class="item-sub">Vencimento: ${fmtDate(p.vencimento)} ${labelDia(daysUntil(p.vencimento))}</p></div></div>`).join('')}</div>`:''
  const sC = contasAlerta.length?`<div class="card"><p class="section-title">💸 Contas a Pagar (${contasAlerta.length})</p>${contasAlerta.map(c=>`<div class="item"><span class="emoji">💸</span><div class="item-body"><p class="item-title">${esc(c.fornecedor||'—')} · ${fmtCurrency(c.valor||0)}</p><p class="item-sub">${fmtDate(c.vencimento)} ${labelDia(daysUntil(c.vencimento))}</p></div></div>`).join('')}</div>`:''
  const sL = licsAlerta.length?`<div class="card"><p class="section-title">🏛 Licitações (${licsAlerta.length})</p>${licsAlerta.map(l=>`<div class="item"><span class="emoji">🏛</span><div class="item-body"><p class="item-title">${esc(l.orgao||'—')} · ${esc(l.numero||'')}</p><p class="item-sub">Abertura: ${fmtDate(l.dataAbertura)} ${labelDia(daysUntil(l.dataAbertura))}</p></div></div>`).join('')}</div>`:''
  const sART=semART.length?`<div class="card"><p class="section-title">📜 Projetos sem ART (${semART.length})</p>${semART.map(p=>`<div class="item"><span class="emoji">⚠️</span><div class="item-body"><p class="item-title">${esc(p.titulo||'—')}</p><p class="item-sub">${p.ordemServico?'OS: '+esc(p.ordemServico)+' · ':''}Sem ART registrada</p></div></div>`).join('')}</div>`:''
  const tudo=sA+sF+sP+sC+sL+sART
  const nenhum=!tudo?`<div class="card"><div class="ok-banner">✅ <strong>Tudo em dia!</strong> Nenhum alerta para hoje.</div></div>`:''
  const titulo=urgentOnly?'🚨 Alertas Urgentes':'📋 Resumo Diário'
  const dataFmt=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>${STYLE}</style></head><body><div class="wrap"><div class="header"><div style="font-size:32px">⚙️</div><h1 class="h-title">${titulo} — Bikows CRM</h1><p class="h-sub">${dataFmt}</p></div>${tudo||nenhum}<div class="footer"><p>Bikows Soluções em Engenharia · <a href="${CRM_URL}">Acessar CRM</a></p></div></div></body></html>`
}

function buildWeeklyEmail(leads:any[],projetos:any[],licitacoes:any[],recebiveis:any[],atividades:any[],dataFormatada:string):string{
  const mesAtual=new Date().toISOString().slice(0,7)
  const hojeStr=new Date().toISOString().split('T')[0]
  const ativos=leads.filter(l=>!['fechado_ganho','executado','fechado_perdido'].includes(l.status))
  const ganhosMes=leads.filter(l=>['fechado_ganho','executado'].includes(l.status)&&(l.dataMudancaStatus||l.dataEntrada||'').startsWith(mesAtual))
  const totalPipeline=ativos.reduce((s:number,l:any)=>s+(l.valorEstimado||0),0)
  const receitaMes=ganhosMes.reduce((s:number,l:any)=>s+(Number(l.valorFechado)||Number(l.valorEstimado)||0),0)
  const projetosAtivos=projetos.filter(p=>p.status==='em_andamento')
  const projetosAtrasados=projetosAtivos.filter(p=>p.prazo&&(daysUntil(p.prazo)??0)<0)
  const licsAtivas=licitacoes.filter(l=>!['ganhou','perdeu','deserta','cancelada','descartada'].includes(l.status))
  let aReceber=0,vencidos=0
  recebiveis.forEach(r=>(r.parcelas||[]).forEach((p:any)=>{
    if(p.status==='recebido')return
    const d=daysUntil(p.vencimento)
    if(d!==null&&d>=0)aReceber+=(p.valor||0)
    else if(d!==null&&d<0)vencidos+=(p.valor||0)
  }))
  const em7=new Date();em7.setDate(em7.getDate()+7);const em7s=em7.toISOString().split('T')[0]
  const atvsemana=atividades.filter(a=>a.status==='pendente'&&a.data&&a.data>=hojeStr&&a.data<=em7s).length
  const atvsAtrasadas=atividades.filter(a=>a.status==='pendente'&&a.data&&a.data<hojeStr).length
  const LABELS:Record<string,string>={lead_identificado:'Lead Identificado',primeiro_contato:'1º Contato',qualificacao:'Qualificação',proposta_elaboracao:'Em Proposta',proposta_enviada:'Proposta Enviada',negociacao:'Negociação'}
  const estagios:Record<string,number>={};ativos.forEach((l:any)=>{estagios[l.status]=(estagios[l.status]||0)+1})
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>${STYLE}</style></head><body><div class="wrap"><div class="header"><div style="font-size:32px">📊</div><h1 class="h-title">Relatório Semanal — Bikows CRM</h1><p class="h-sub">${dataFormatada}</p></div><div class="card"><p class="section-title">💼 Pipeline Comercial</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;text-align:center;background:#f8fafc;border-radius:8px"><div style="font-size:22px;font-weight:800;color:#0f172a">${fmtCurrency(totalPipeline)}</div><div style="font-size:11px;color:#64748b">Pipeline Ativo (${ativos.length} leads)</div></td><td style="width:12px"></td><td style="padding:8px;text-align:center;background:#f0fdf4;border-radius:8px"><div style="font-size:22px;font-weight:800;color:#16a34a">${fmtCurrency(receitaMes)}</div><div style="font-size:11px;color:#64748b">Receita no Mês (${ganhosMes.length})</div></td></tr></table>${Object.keys(estagios).length?`<p style="font-size:12px;color:#64748b;margin:16px 0 8px">Por estágio:</p>${Object.entries(estagios).map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span>${LABELS[k]||k}</span><strong>${v}</strong></div>`).join('')}`:''}</div><div class="card"><p class="section-title">💰 Financeiro</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;text-align:center;background:#f8fafc;border-radius:8px"><div style="font-size:20px;font-weight:800">${fmtCurrency(aReceber)}</div><div style="font-size:11px;color:#64748b">A Receber</div></td><td style="width:12px"></td><td style="padding:8px;text-align:center;background:${vencidos>0?'#fef2f2':'#f8fafc'};border-radius:8px"><div style="font-size:20px;font-weight:800;color:${vencidos>0?'#dc2626':'#0f172a'}">${fmtCurrency(vencidos)}</div><div style="font-size:11px;color:#64748b">Vencido</div></td></tr></table></div><div class="card"><p class="section-title">🔧 Operacional</p><div class="item"><span class="emoji">📋</span><div class="item-body"><p class="item-title">${projetosAtivos.length} projetos em andamento</p><p class="item-sub">${projetosAtrasados.length>0?`⚠️ ${projetosAtrasados.length} atrasado(s)`:'✅ Todos no prazo'}</p></div></div><div class="item"><span class="emoji">🏛</span><div class="item-body"><p class="item-title">${licsAtivas.length} licitações ativas</p><p class="item-sub">${fmtCurrency(licsAtivas.reduce((s:number,l:any)=>s+(l.valorEstimado||0),0))} em disputa</p></div></div><div class="item"><span class="emoji">📋</span><div class="item-body"><p class="item-title">${atvsemana} atividades para essa semana</p><p class="item-sub">${atvsAtrasadas>0?`⚠️ ${atvsAtrasadas} atrasada(s)`:'✅ Nenhuma atrasada'}</p></div></div></div><div style="text-align:center"><a href="${CRM_URL}" class="btn">Acessar o CRM →</a></div><div class="footer"><p>Bikows Soluções em Engenharia</p></div></div></body></html>`
}

async function sendEmail(subject:string,html:string):Promise<boolean>{
  if(!RESEND_KEY) return false
  const res=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${RESEND_KEY}`},
    body:JSON.stringify({from:EMAIL_FROM,to:[EMAIL_TO],subject,html}),
  })
  return res.ok
}

/* ================================================================
   HANDLER PRINCIPAL
   ================================================================ */
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response(null,{headers:CORS})
  const auth = await authorize(req)
  if(!auth.ok){
    console.warn('[notifications] recusado:', auth.via)
    return new Response(JSON.stringify({ok:false,error:'NAO_AUTORIZADO',via:auth.via}),{status:401,headers:JSON_H})
  }
  try{
    const body=await req.json().catch(()=>({}))
    const tipo:string=body.tipo||'daily'
    const supabase=admin
    const hoje=new Date()
    const hojeStr=hoje.toISOString().split('T')[0]
    const dataFmt=hoje.toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'})
    const diaSemana=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'][hoje.getDay()]
    const[a,l,r,cp,li,p]=await Promise.all([
      supabase.from('atividades').select('data'),
      supabase.from('leads').select('data'),
      supabase.from('recebiveis').select('data'),
      supabase.from('contaspagar').select('data'),
      supabase.from('licitacoes').select('data'),
      supabase.from('projetos').select('data'),
    ])
    const atividades=(a.data||[]).map((x:any)=>x.data).filter(Boolean)
    const leads=(l.data||[]).map((x:any)=>x.data).filter(Boolean)
    const recebiveis=(r.data||[]).map((x:any)=>x.data).filter(Boolean)
    const contasPagar=(cp.data||[]).map((x:any)=>x.data).filter(Boolean)
    const licitacoes=(li.data||[]).map((x:any)=>x.data).filter(Boolean)
    const projetos=(p.data||[]).map((x:any)=>x.data).filter(Boolean)
    let emailSent=false,tgSent=false
    if(tipo==='weekly'){
      const subject=`📊 Relatório Semanal Bikows CRM — ${dataFmt}`
      const html=buildWeeklyEmail(leads,projetos,licitacoes,recebiveis,atividades,dataFmt)
      const tg=buildTelegramWeekly(leads,projetos,licitacoes,recebiveis)
      emailSent=await sendEmail(subject,html)
      await sendTelegram(tg);tgSent=true
    }else if(tipo==='urgent'){
      const subject=`🚨 Alertas Urgentes Bikows CRM — ${dataFmt}`
      const html=buildDailyEmail(atividades,leads,recebiveis,contasPagar,licitacoes,projetos,hojeStr,true)
      const tg=buildTelegramUrgent(atividades,leads,recebiveis,contasPagar)
      if(html){emailSent=await sendEmail(subject,html)}
      if(tg){await sendTelegram(tg);tgSent=true}
    }else{
      const subject=`📋 Resumo Diário — ${diaSemana}, ${dataFmt}`
      const html=buildDailyEmail(atividades,leads,recebiveis,contasPagar,licitacoes,projetos,hojeStr,false)
      const tg=buildTelegramDaily(atividades,leads,recebiveis,contasPagar,licitacoes,projetos,hojeStr)
      if(html){emailSent=await sendEmail(subject,html)}
      await sendTelegram(tg);tgSent=true
    }
    return new Response(JSON.stringify({ok:true,tipo,email:emailSent,telegram:tgSent,via:auth.via}),{headers:JSON_H})
  }catch(e){
    return new Response(JSON.stringify({error:String(e)}),{status:500,headers:JSON_H})
  }
})
