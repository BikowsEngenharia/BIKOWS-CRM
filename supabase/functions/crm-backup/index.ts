import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''

// v9 — novas tabelas visitas e equipamentos (módulos Visitas Técnicas e
// Equipamentos & Inspeções) + autorização (x-cron-secret do pg_cron ou
// usuário logado). Antes qualquer pessoa podia disparar o backup por e-mail.
const TABLES = [
  'clientes', 'contatos', 'leads', 'projetos', 'atividades',
  'propostas', 'recebiveis', 'funcionarios', 'lancamentos',
  'contaspagar', 'folha', 'licitacoes', 'metas', 'contratos',
  'marketing_posts', 'marketing_campanhas', 'marketing_ideias', 'marketing_kpis',
  'trafego_campanhas', 'trafego_metas',
  'timesheet', 'arts', 'socios', 'documentos',
  'despesas_fixas', 'dividas', 'ativos_empresa',
  'pessoal_lancamentos', 'plano_acoes', 'agenda_pessoal', 'pessoal_despesas_fixas',
  'visitas', 'equipamentos',
]

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
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

async function sendEmail(to: string[], from: string, subject: string, html: string, attachmentContent?: string, attachmentName?: string): Promise<boolean> {
  if (!RESEND_KEY) { console.warn('[Email] RESEND_API_KEY nao configurada'); return false }

  const body: any = { from, to, subject, html }

  if (attachmentContent && attachmentName) {
    const b64 = btoa(unescape(encodeURIComponent(attachmentContent)))
    body.attachments = [{
      filename: attachmentName,
      content: b64,
    }]
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) console.error('[Email] Erro Resend:', await res.text())
  return res.ok
}

const STYLE = `body{margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:600px;margin:0 auto;padding:24px 16px}.header{background:#0B1B33;border-radius:12px;padding:24px;margin-bottom:16px;text-align:center}.h-title{color:#fff;font-size:20px;font-weight:700;margin:8px 0 4px}.h-sub{color:#8FA0B5;font-size:13px;margin:0}.card{background:#fff;border-radius:12px;padding:20px 24px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,.06)}.section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin:0 0 12px}table.data{width:100%;border-collapse:collapse;font-size:13px}table.data th{text-align:left;padding:6px 8px;border-bottom:2px solid #e2e8f0;color:#64748b;font-size:11px;text-transform:uppercase}table.data td{padding:7px 8px;border-bottom:1px solid #f1f5f9}table.data tr:last-child td{border-bottom:none}.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#f0fdf4;color:#16a34a}.footer{text-align:center;font-size:11px;color:#94a3b8;padding:16px 0}`

function buildHtml(
  contagens: Record<string, number>,
  totalRegistros: number,
  tamanhoKb: number,
  dataBackup: string,
  urgente: boolean,
  falhas: string[]
): string {
  // Mostra primeiro as tabelas com dados, depois as vazias
  const entradas = Object.entries(contagens).sort((a, b) => b[1] - a[1])
  const rows = entradas.map(([t, n]) =>
    `<tr><td><strong>${t}</strong></td><td style="text-align:right;${n === 0 ? 'color:#94a3b8' : ''}">${n}</td></tr>`
  ).join('')

  const alertaBanner = urgente ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:13px;color:#C42B2B">&#9888; <strong>Atencao:</strong> O backup do dia anterior pode ter falhado. Verifique o arquivo em anexo.</div>` : ''

  const falhaBanner = falhas.length ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:13px;color:#92400e">&#9888; <strong>Tabelas que nao puderam ser lidas:</strong> ${falhas.join(', ')}</div>` : ''

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>${STYLE}</style></head><body><div class="wrap">
    <div class="header">
      <div style="font-size:32px">&#128190;</div>
      <h1 class="h-title">Backup CRM Bikows</h1>
      <p class="h-sub">${dataBackup}</p>
    </div>
    ${alertaBanner}
    ${falhaBanner}
    <div class="card">
      <p class="section-title">Resumo do Backup</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <div style="flex:1;min-width:130px;background:#f8fafc;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#0f172a">${totalRegistros}</div>
          <div style="font-size:11px;color:#64748b">Total de registros</div>
        </div>
        <div style="flex:1;min-width:130px;background:#f0fdf4;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#16a34a">${tamanhoKb} KB</div>
          <div style="font-size:11px;color:#64748b">Tamanho do arquivo</div>
        </div>
        <div style="flex:1;min-width:130px;background:#eff6ff;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#1D4F8C">${Object.keys(contagens).length}</div>
          <div style="font-size:11px;color:#64748b">Tabelas exportadas</div>
        </div>
      </div>
      <table class="data"><thead><tr><th>Tabela</th><th style="text-align:right">Registros</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div style="background:#f8fafc;border-radius:8px;padding:12px 16px;font-size:12px;color:#64748b;margin-bottom:14px">
      &#128206; O arquivo <strong>backup_bikows_crm_${dataBackup.replace(/[^0-9]/g, '')}.json</strong> esta anexado a este email.
    </div>
    <div class="footer"><p>Bikows CRM &mdash; Backup automatico &middot; ${dataBackup}</p></div>
  </div></body></html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const auth = await authorize(req)
  if (!auth.ok) {
    console.warn('[backup] recusado:', auth.via)
    return new Response(JSON.stringify({ ok: false, error: 'NAO_AUTORIZADO', via: auth.via }), { status: 401, headers: JSON_H })
  }

  try {
    const supabase = admin

    const { data: cfgRows } = await supabase.from('crm_config').select('key, value').in('key', ['notificacoes', 'ultimo_backup'])
    const cfgMap: Record<string, any> = {}
    ;(cfgRows || []).forEach((r: any) => { cfgMap[r.key] = r.value })
    const notifCfg = cfgMap['notificacoes'] || {}
    const ultimoBackup = cfgMap['ultimo_backup'] || { sucesso: true, data: null }
    const emailTo: string[] = notifCfg.emailDestinatarios || ['contato@bikows.com.br']
    const emailFrom: string = notifCfg.emailFrom || 'CRM Bikows <onboarding@resend.dev>'

    const backupAnteriorFalhou = ultimoBackup.sucesso === false

    const tableResults = await Promise.all(
      TABLES.map(table => supabase.from(table).select('data').then(res => ({ table, res })))
    )

    const tablesData: Record<string, any[]> = {}
    const contagens: Record<string, number> = {}
    const falhas: string[] = []
    let totalRegistros = 0

    for (const { table, res } of tableResults) {
      if (res.error) {
        console.warn(`[Backup] Erro ao ler tabela ${table}:`, res.error.message)
        tablesData[table] = []
        contagens[table] = 0
        falhas.push(table)
      } else {
        const registros = (res.data || []).map((x: any) => x.data).filter(Boolean)
        tablesData[table] = registros
        contagens[table] = registros.length
        totalRegistros += registros.length
      }
    }

    // Config tambem entra no backup (dados da empresa, responsaveis, servicos...)
    try {
      const { data: cfgAll } = await supabase.from('config').select('data').eq('id', 'singleton').maybeSingle()
      if (cfgAll?.data) (tablesData as any)['__config'] = cfgAll.data
    } catch (_) { /* opcional */ }

    const backupObj = {
      exportDate: new Date().toISOString(),
      version: '3.1',
      empresa: 'Bikows Empreendimentos LTDA',
      totalTabelas: TABLES.length,
      tables: tablesData,
    }
    const backupStr = JSON.stringify(backupObj, null, 2)
    const tamanhoKb = Math.round(backupStr.length / 1024)

    const now = new Date()
    const dataBackup = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const dateSlug = now.toISOString().split('T')[0].replace(/-/g, '')
    const attachName = `backup_bikows_crm_${dateSlug}.json`

    const urgente = backupAnteriorFalhou
    const subjectPrefix = urgente ? '⚠️\u{1F4BE}' : '\u{1F4BE}'
    const subject = `${subjectPrefix} Backup CRM Bikows — ${dataBackup} — ${totalRegistros} registros`
    const html = buildHtml(contagens, totalRegistros, tamanhoKb, dataBackup, urgente, falhas)

    const emailSent = await sendEmail(emailTo, emailFrom, subject, html, backupStr, attachName)

    // Guarda tambem no Storage (bucket 'backups') — redundancia caso o e-mail falhe
    let storageOk = false
    try {
      const blob = new Blob([backupStr], { type: 'application/json' })
      const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
      const paths = [
        `servidor/backup-${dias[now.getDay()]}.json`,
        `servidor/mensal/backup-${now.toISOString().slice(0, 7)}.json`,
      ]
      for (const p of paths) {
        const { error } = await supabase.storage.from('backups').upload(p, blob, { upsert: true, contentType: 'application/json' })
        if (error) { console.warn('[Backup] storage:', p, error.message); break }
      }
      storageOk = true
    } catch (e) { console.warn('[Backup] storage erro:', e) }

    await supabase.from('crm_config').upsert({
      key: 'ultimo_backup',
      value: { sucesso: emailSent || storageOk, data: now.toISOString(), registros: totalRegistros, tabelas: TABLES.length, storage: storageOk, falhas },
      updated_at: now.toISOString(),
    })

    return new Response(JSON.stringify({
      ok: true,
      totalRegistros,
      tamanhoKb,
      totalTabelas: TABLES.length,
      tabelas: contagens,
      falhas,
      emailSent,
      storageOk,
      urgente,
      via: auth.via,
    }), { headers: JSON_H })

  } catch (e) {
    console.error('[crm-backup] Erro:', e)
    try {
      await admin.from('crm_config').upsert({ key: 'ultimo_backup', value: { sucesso: false, data: new Date().toISOString(), erro: String(e) } })
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: JSON_H })
  }
})
