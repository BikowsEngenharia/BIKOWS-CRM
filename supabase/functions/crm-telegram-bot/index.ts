/**
 * Bikows CRM — Telegram Bot v15
 * Supabase Edge Function — Deno runtime
 *
 * v15: porteiro de webhook em duas camadas, porque esta função roda com
 * chave de serviço e as ferramentas abaixo leem e gravam o CRM inteiro:
 *   1. o cabeçalho X-Telegram-Bot-Api-Secret-Token, que só o Telegram envia
 *      (registrado via setWebhook com secret_token);
 *   2. o chat de origem precisa estar na lista de autorizados de crm_config.
 * O segredo é gerado e guardado no banco, e a própria função registra o
 * webhook na primeira execução: assim ele nunca precisa sair do servidor.
 *
 * Schema Supabase: todas as tabelas usam { id TEXT, data JSONB, created_at TIMESTAMPTZ }
 * Bot lê com select('data') e grava com upsert({ id, data: {...} })
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TG_TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const ANTHROPIC   = Deno.env.get('ANTHROPIC_API_KEY_BOT_CRM_BIKOWS')!;

const sb = createClient(SUPABASE_URL, SUPABASE_SVC);
const TG = `https://api.telegram.org/bot${TG_TOKEN}`;
const MAX_HISTORY = 16;

// ── Segurança do webhook ──────────────────────────────────────────────────────

/** Lê uma chave de crm_config. */
async function cfg(key: string): Promise<Record<string, any>> {
  const { data } = await sb.from('crm_config').select('value').eq('key', key).maybeSingle();
  return (data as any)?.value || {};
}

/**
 * O Telegram repete em todo POST o secret_token informado no setWebhook.
 * Sem esse cabeçalho (ou com valor errado) a requisição não veio do Telegram.
 * O segredo fica em crm_config.telegram_webhook.secret; se não existir,
 * a função recusa tudo em vez de liberar — falhar fechado é o certo aqui.
 */
async function webhookAutorizado(req: Request): Promise<boolean> {
  const enviado = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!enviado) return false;
  const esperado = (await cfg('telegram_webhook')).secret || '';
  return !!esperado && enviado === esperado;
}

/** Só os chats cadastrados podem comandar o CRM. */
async function chatAutorizado(chatId: string): Promise<boolean> {
  const tg = await cfg('telegram');
  const permitidos = [tg.chatId, ...(Array.isArray(tg.chatIdsPermitidos) ? tg.chatIdsPermitidos : [])]
    .filter(Boolean).map((c: any) => String(c));
  if (!permitidos.length) return false;
  return permitidos.includes(String(chatId));
}

/**
 * Registra o webhook no Telegram na primeira execução depois de um deploy,
 * usando o segredo já gravado em crm_config.telegram_webhook.
 *
 * Existe para que o segredo nunca precise sair do servidor: quem publica a
 * função não carrega nem o token do bot nem o secret_token na mão. Roda uma
 * vez por instância (a flag de memória) e uma vez por segredo (a flag em
 * crm_config), então o custo em regime normal é zero.
 */
let _webhookVerificado = false;

async function garantirWebhookRegistrado(): Promise<Record<string, any> | null> {
  if (_webhookVerificado) return null;
  _webhookVerificado = true;
  try {
    const wh = await cfg('telegram_webhook');
    if (!wh.secret) return { ok: false, motivo: 'SEGREDO_NAO_CADASTRADO' };
    if (wh.registrado === true) return { ok: true, motivo: 'JA_REGISTRADO' };

    const url = `${SUPABASE_URL}/functions/v1/crm-telegram-bot`;
    const r = await fetch(`${TG}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        secret_token: wh.secret,
        allowed_updates: ['message', 'edited_message'],
        drop_pending_updates: false,
      }),
    });
    const j = await r.json().catch(() => ({ ok: false, description: 'resposta ilegivel' }));
    if (j.ok) {
      await sb.from('crm_config').update({
        value: { ...wh, registrado: true, registradoEm: new Date().toISOString() },
      }).eq('key', 'telegram_webhook');
    }
    return { ok: !!j.ok, motivo: j.ok ? 'REGISTRADO_AGORA' : (j.description || 'FALHA') };
  } catch (e) {
    console.error('garantirWebhookRegistrado:', e);
    _webhookVerificado = false;   // deixa tentar de novo na próxima requisição
    return { ok: false, motivo: 'ERRO' };
  }
}

/** Registra o webhook no Telegram com o secret_token. Protegido pelo segredo do cron. */
async function configurarWebhook(req: Request): Promise<Response> {
  const enviado = req.headers.get('x-cron-secret') || '';
  const esperado = (await cfg('cron_secret')).secret || '';
  if (!esperado || enviado !== esperado) {
    return new Response(JSON.stringify({ ok: false, error: 'NAO_AUTORIZADO' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const segredo = (await cfg('telegram_webhook')).secret || '';
  if (!segredo) {
    return new Response(JSON.stringify({ ok: false, error: 'SEGREDO_DO_WEBHOOK_NAO_CADASTRADO' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const url = `${SUPABASE_URL}/functions/v1/crm-telegram-bot`;
  const r = await fetch(`${TG}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: segredo,
      allowed_updates: ['message', 'edited_message'],
      drop_pending_updates: false,
    }),
  });
  const j = await r.json().catch(() => ({ ok: false }));
  // info do webhook sem devolver segredo nenhum
  const info = await fetch(`${TG}/getWebhookInfo`).then(x => x.json()).catch(() => null);
  return new Response(JSON.stringify({
    ok: !!j.ok,
    descricao: j.description || '',
    urlRegistrada: info?.result?.url || url,
    pendentes: info?.result?.pending_update_count ?? null,
    ultimoErro: info?.result?.last_error_message || null,
  }), { headers: { 'Content-Type': 'application/json' } });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function genId():string{return Date.now().toString(36)+Math.random().toString(36).substring(2,9);}
function today():string{return new Date().toISOString().split('T')[0];}
function addDays(n:number):string{return new Date(Date.now()+n*86400000).toISOString().split('T')[0];}
function fmt(n:number):string{return 'R$ '+(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2});}
function parseDatePT(d:string):string{
  if(!d)return today();
  if(/^\d{4}-\d{2}-\d{2}$/.test(d))return d;
  const l=d.toLowerCase().trim();
  if(l==='hoje')return today();
  if(l==='amanhã'||l==='amanha')return addDays(1);
  if(l==='depois de amanhã'||l==='depois de amanha')return addDays(2);
  if(l==='semana que vem')return addDays(7);
  const dow:Record<string,number>={segunda:1,terca:2,'terça':2,quarta:3,quinta:4,sexta:5,sabado:6,'sábado':6};
  if(dow[l]!==undefined){const d2=new Date();let diff=dow[l]-d2.getDay();if(diff<=0)diff+=7;d2.setDate(d2.getDate()+diff);return d2.toISOString().split('T')[0];}
  const m=d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const m2=d.match(/^(\d{1,2})\/(\d{1,2})$/);
  if(m2)return `${new Date().getFullYear()}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
  return today();
}

// ── Helpers Supabase (schema: {id, data JSONB, created_at}) ──────────────────────

/** Salva/atualiza um registro no formato correto */
async function sbSave(table:string, record:Record<string,any>):Promise<void>{
  const now=new Date().toISOString();
  await sb.from(table).upsert({
    id: record.id,
    data: {...record, updatedAt: now},
    updated_at: now,
  },{onConflict:'id'});
}

/** Lê um registro pelo id */
async function sbRead(table:string,id:string):Promise<Record<string,any>|null>{
  const {data}=await sb.from(table).select('data').eq('id',id).single();
  return (data as any)?.data||null;
}

/** Busca registros por campo JSONB com ilike */
async function sbSearch(table:string,field:string,value:string,limit=5):Promise<any[]>{
  const {data}=await sb.from(table).select('data').ilike(`data->>${field}`,`%${value}%`).limit(limit);
  return ((data||[]) as any[]).map((r:any)=>r.data).filter(Boolean);
}

/** Busca todos os registros de uma tabela (filtragem feita em JS) */
async function sbAll(table:string,limitN=500):Promise<any[]>{
  const {data}=await sb.from(table).select('data').order('created_at',{ascending:true}).limit(limitN);
  return ((data||[]) as any[]).map((r:any)=>r.data).filter(Boolean);
}

// ── Memória de conversa ────────────────────────────────────────────────────────
async function loadHistory(chatId:string):Promise<Anthropic.MessageParam[]>{
  try{const {data}=await sb.from('bot_sessions').select('messages').eq('chat_id',chatId).single();return ((data as any)?.messages as Anthropic.MessageParam[])||[];}catch{return [];}
}
async function saveHistory(chatId:string,userText:string,assistantText:string):Promise<void>{
  try{
    const prev=await loadHistory(chatId);
    const updated=[...prev,{role:'user' as const,content:userText},{role:'assistant' as const,content:assistantText}].slice(-MAX_HISTORY);
    await sb.from('bot_sessions').upsert({chat_id:chatId,messages:updated,updated_at:new Date().toISOString()},{onConflict:'chat_id'});
  }catch(e){console.error('saveHistory:',e);}
}
async function clearHistory(chatId:string):Promise<void>{
  try{await sb.from('bot_sessions').delete().eq('chat_id',chatId);}catch{}
}

// ── Telegram ──────────────────────────────────────────────────────────────────
async function send(chatId:string,text:string):Promise<void>{
  const chunks:string[]=[];
  let rem=text;
  while(rem.length>4000){chunks.push(rem.substring(0,4000));rem=rem.substring(4000);}
  chunks.push(rem);
  for(const chunk of chunks){
    const r=await fetch(`${TG}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text:chunk,parse_mode:'Markdown'})});
    const j=await r.json().catch(()=>({ok:false}));
    if(!j.ok)await fetch(`${TG}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text:chunk.replace(/[*_`\[\]]/g,'')})});
  }
}
async function typing(chatId:string):Promise<void>{
  await fetch(`${TG}/sendChatAction`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,action:'typing'})});
}

// ── Comandos diretos ──────────────────────────────────────────────────────────
async function cmdStart(chatId:string):Promise<void>{
  await send(chatId,[
    '🤖 *Bikows CRM — Assistente 24/7*','',
    '*📊 Comandos rápidos:*',
    '/hoje — atividades de hoje e amanhã',
    '/semana — agenda dos próximos 7 dias',
    '/pipeline — funil de vendas',
    '/financeiro — resumo financeiro',
    '/projetos — projetos em andamento',
    '/propostas — propostas em aberto',
    '/licitacoes — licitações ativas',
    '/pendencias — tudo em atraso',
    '/relatorio — resumo executivo',
    '/limpar — limpar contexto da conversa','',
    '*✍️ Fale naturalmente:*',
    '• "Reunião com Serra Fita amanhã às 14h"',
    '• "Cancela/Reagenda a visita de hoje"',
    '• "Como está a Serra Fita?"',
    '• "Fechei contrato com Eletran, abre projeto"',
    '• "Ganhamos a licitação da Prefeitura"',
    '• "Paguei fornecedor R$2.000 de material"',
    '• "Recebi R$5.000 da DUE Laser"',
    '• "Atualiza telefone da Serra Fita"',
  ].join('\n'));
}

async function cmdHoje(chatId:string):Promise<void>{
  const hj=today();const amanha=addDays(1);
  const [todasAtivs,todosLeads,todosRecs]=await Promise.all([
    sbAll('atividades'),
    sbAll('leads'),
    sbAll('recebiveis'),
  ]);
  const TIPO:Record<string,string>={ligacao:'📞',email:'📧',reuniao:'🤝',followup:'🔄',tarefa:'✅',visita:'🏭'};
  const FECHADOS=['fechado_ganho','executado','fechado_perdido'];
  const ativsPend=todasAtivs.filter((a:any)=>a.status==='pendente'&&a.data>=addDays(-7)&&a.data<=amanha);
  const atrasadas=ativsPend.filter((a:any)=>a.data<hj).sort((a:any,b:any)=>a.data.localeCompare(b.data));
  const hj_a=ativsPend.filter((a:any)=>a.data===hj).sort((a:any,b:any)=>(a.hora||'').localeCompare(b.hora||''));
  const am_a=ativsPend.filter((a:any)=>a.data===amanha).sort((a:any,b:any)=>(a.hora||'').localeCompare(b.hora||''));
  const followups=todosLeads.filter((l:any)=>!FECHADOS.includes(l.status)&&l.dataProximaAcao&&l.dataProximaAcao<=hj);
  const parcVenc:string[]=[];
  for(const r of todosRecs)for(const p of (r.parcelas||[]))
    if(p.status!=='recebido'&&(p.vencimento===hj||p.vencimento===amanha))
      parcVenc.push(`• ${r.descricao} — ${fmt(p.valor)} _(${p.vencimento===hj?'hoje':'amanhã'})_`);
  const lines:string[]=[`📅 *${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}*`,''];
  if(atrasadas.length){lines.push(`⚠️ *ATRASADAS (${atrasadas.length}):*`);atrasadas.slice(0,5).forEach((a:any)=>lines.push(`• ${TIPO[a.tipo]||'📌'} ${a.titulo} _(${a.data})_`));lines.push('');}
  if(hj_a.length){lines.push(`📋 *HOJE (${hj_a.length}):*`);hj_a.forEach((a:any)=>{const h=a.hora?`${a.hora}${a.horaFim?'–'+a.horaFim:''} `:'';lines.push(`• ${TIPO[a.tipo]||'📌'} ${h}${a.titulo}`);});lines.push('');}
  if(am_a.length){lines.push(`📋 *AMANHÃ (${am_a.length}):*`);am_a.forEach((a:any)=>{const h=a.hora?`${a.hora}${a.horaFim?'–'+a.horaFim:''} `:'';lines.push(`• ${TIPO[a.tipo]||'📌'} ${h}${a.titulo}`);});lines.push('');}
  if(followups.length){lines.push(`💼 *FOLLOW-UPS VENCIDOS (${followups.length}):*`);followups.slice(0,4).forEach((l:any)=>lines.push(`• ${l.titulo} — desde ${l.dataProximaAcao}`));lines.push('');}
  if(parcVenc.length){lines.push(`💰 *VENCIMENTOS:*`);parcVenc.forEach(p=>lines.push(p));}
  if(lines.length<=2)lines.push('✅ Nada pendente!');
  await send(chatId,lines.join('\n'));
}

async function cmdSemana(chatId:string):Promise<void>{
  const hj=today();const fim=addDays(7);
  const todas=await sbAll('atividades');
  const ativs=todas.filter((a:any)=>a.status==='pendente'&&a.data>=hj&&a.data<=fim)
    .sort((a:any,b:any)=>a.data.localeCompare(b.data)||(a.hora||'').localeCompare(b.hora||''));
  if(!ativs.length){await send(chatId,'📅 Nenhuma atividade nos próximos 7 dias.');return;}
  const TIPO:Record<string,string>={ligacao:'📞',email:'📧',reuniao:'🤝',followup:'🔄',tarefa:'✅',visita:'🏭'};
  const byDay:Record<string,string[]>={};
  ativs.forEach((a:any)=>{if(!byDay[a.data])byDay[a.data]=[];const h=a.hora?a.hora+' ':'';byDay[a.data].push(`  • ${TIPO[a.tipo]||'📌'} ${h}${a.titulo}`);});
  const lines=['📅 *Agenda — Próximos 7 dias*',''];
  const ds=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  Object.keys(byDay).sort().forEach(data=>{
    const d=new Date(data+'T12:00:00');
    const label=data===hj?'*HOJE*':data===addDays(1)?'*AMANHÃ*':`*${ds[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}*`;
    lines.push(label);byDay[data].forEach(l=>lines.push(l));lines.push('');
  });
  await send(chatId,lines.join('\n'));
}

async function cmdPipeline(chatId:string):Promise<void>{
  const FECHADOS=['fechado_ganho','executado','fechado_perdido'];
  const leads=await sbAll('leads');
  const ativos=leads.filter((l:any)=>!FECHADOS.includes(l.status));
  if(!ativos.length){await send(chatId,'📊 Pipeline vazio.');return;}
  const LABELS:Record<string,string>={lead_identificado:'🔵 Lead Identificado',primeiro_contato:'📞 1º Contato',qualificacao:'🔍 Qualificação',proposta_elaboracao:'📋 Em Elaboração',proposta_enviada:'📤 Proposta Enviada',negociacao:'🤝 Negociação'};
  const ORDER=['lead_identificado','primeiro_contato','qualificacao','proposta_elaboracao','proposta_enviada','negociacao'];
  const g:Record<string,{c:number;v:number}>={};let total=0;
  ativos.forEach((l:any)=>{if(!g[l.status])g[l.status]={c:0,v:0};g[l.status].c++;g[l.status].v+=(l.valorEstimado||0);total+=(l.valorEstimado||0);});
  const lines=[`📊 *Pipeline — ${ativos.length} leads | ${fmt(total)}*`,''];
  ORDER.forEach(s=>{if(g[s])lines.push(`${LABELS[s]}: *${g[s].c}* | ${fmt(g[s].v)}`);});
  await send(chatId,lines.join('\n'));
}

async function cmdFinanceiro(chatId:string):Promise<void>{
  const hj=today();const mes=hj.substring(0,7);
  const [recs,lancs,pagar]=await Promise.all([sbAll('recebiveis'),sbAll('lancamentos'),sbAll('contaspagar')]);
  let aReceber=0,vencido=0;
  for(const r of recs)for(const p of (r.parcelas||[])){
    if(p.status==='recebido')continue;
    if(p.vencimento<hj)vencido+=(p.valor||0);else aReceber+=(p.valor||0);
  }
  const aPagar=pagar.filter((p:any)=>p.status==='pendente').reduce((s:number,p:any)=>s+(p.valor||0),0);
  const mesLancs=lancs.filter((l:any)=>l.data&&l.data.startsWith(mes));
  const recMes=mesLancs.filter((l:any)=>l.tipo==='receita'&&l.status==='recebido').reduce((s:number,l:any)=>s+(l.valor||0),0);
  const despMes=mesLancs.filter((l:any)=>l.tipo==='despesa'&&l.status==='pago').reduce((s:number,l:any)=>s+(l.valor||0),0);
  await send(chatId,['💰 *Resumo Financeiro*','',`📥 Receita do mês: *${fmt(recMes)}*`,`📤 Despesas: *${fmt(despMes)}*`,`📊 Resultado: *${fmt(recMes-despMes)}*`,'',`💳 A receber: *${fmt(aReceber)}*`,`⚠️ Vencido: *${fmt(vencido)}*`,`📤 A pagar: *${fmt(aPagar)}*`].join('\n'));
}

async function cmdProjetos(chatId:string):Promise<void>{
  const hj=today();
  const projetos=(await sbAll('projetos')).filter((p:any)=>p.status==='em_andamento').sort((a:any,b:any)=>(a.prazo||'').localeCompare(b.prazo||''));
  if(!projetos.length){await send(chatId,'🏗 Nenhum projeto em andamento.');return;}
  const lines=[`🏗 *Projetos em Andamento (${projetos.length})*`,''];
  projetos.forEach((p:any)=>{const at=p.prazo&&p.prazo<hj?' ⚠️':'';lines.push(`• ${p.titulo}${p.progresso!==undefined?' — '+p.progresso+'%':''}${p.prazo?' | prazo '+p.prazo:''}${at}`);});
  await send(chatId,lines.join('\n'));
}

async function cmdPropostas(chatId:string):Promise<void>{
  const hj=today();
  const FECHADAS=['aprovada','rejeitada','cancelada'];
  const propostas=(await sbAll('propostas')).filter((p:any)=>!FECHADAS.includes(p.status)).sort((a:any,b:any)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,10);
  if(!propostas.length){await send(chatId,'📋 Nenhuma proposta em aberto.');return;}
  const ST:Record<string,string>={elaboracao:'✏️ Elaboração',enviada:'📤 Enviada',negociacao:'🤝 Negociação'};
  const lines=[`📋 *Propostas Abertas (${propostas.length})*`,''];
  propostas.forEach((p:any)=>{const v=p.validade&&p.validade<hj?' ⚠️ VENCIDA':'';lines.push(`• ${p.titulo}${p.valor?' | '+fmt(p.valor):''}\n  ${ST[p.status]||p.status}${p.validade?' | val. '+p.validade:''}${v}`);});
  await send(chatId,lines.join('\n'));
}

async function cmdLicitacoes(chatId:string):Promise<void>{
  const FECHADAS=['ganhou','perdeu','cancelada'];
  const lics=(await sbAll('licitacoes')).filter((l:any)=>!FECHADAS.includes(l.status)).sort((a:any,b:any)=>(a.dataAbertura||'').localeCompare(b.dataAbertura||'')).slice(0,8);
  if(!lics.length){await send(chatId,'🏛 Nenhuma licitação ativa.');return;}
  const lines=['🏛 *Licitações Ativas*',''];
  lics.forEach((l:any)=>lines.push(`• ${l.numero||'—'} — ${l.orgao||''}\n  📅 ${l.dataAbertura||'?'}${l.valor?' | '+fmt(l.valor):''}`) );
  await send(chatId,lines.join('\n'));
}

async function cmdPendencias(chatId:string):Promise<void>{
  const hj=today();
  const FECHADOS=['fechado_ganho','executado','fechado_perdido'];
  const [ativs,leads,recs]=await Promise.all([sbAll('atividades'),sbAll('leads'),sbAll('recebiveis')]);
  const atrasadas=ativs.filter((a:any)=>a.status==='pendente'&&a.data<hj).sort((a:any,b:any)=>a.data.localeCompare(b.data)).slice(0,8);
  const followups=leads.filter((l:any)=>!FECHADOS.includes(l.status)&&l.dataProximaAcao&&l.dataProximaAcao<hj).slice(0,5);
  const pv:string[]=[];
  for(const r of recs)for(const p of (r.parcelas||[]))
    if(p.status!=='recebido'&&p.vencimento<hj)pv.push(`• ${r.descricao} — ${fmt(p.valor)} _(${p.vencimento})_`);
  const lines:string[]=['🚨 *Pendências*',''];
  if(atrasadas.length){lines.push(`📋 *Atividades atrasadas (${atrasadas.length}):*`);atrasadas.forEach((a:any)=>lines.push(`• ${a.titulo} — ${a.data}`));lines.push('');}
  if(followups.length){lines.push(`💼 *Follow-ups vencidos (${followups.length}):*`);followups.forEach((l:any)=>lines.push(`• ${l.titulo} — desde ${l.dataProximaAcao}`));lines.push('');}
  if(pv.length){lines.push(`💰 *Parcelas vencidas (${pv.length}):*`);pv.slice(0,5).forEach(p=>lines.push(p));}
  if(lines.length<=2)lines.push('✅ Sem pendências!');
  await send(chatId,lines.join('\n'));
}

async function cmdRelatorio(chatId:string):Promise<void>{
  const hj=today();const mes=hj.substring(0,7);
  const FECHADOS=['fechado_ganho','executado','fechado_perdido'];
  const [leads,lancs,ativs,projs,props]=await Promise.all([sbAll('leads'),sbAll('lancamentos'),sbAll('atividades'),sbAll('projetos'),sbAll('propostas')]);
  const ativos=leads.filter((l:any)=>!FECHADOS.includes(l.status));
  const pipeline=ativos.reduce((s:number,l:any)=>s+(l.valorEstimado||0),0);
  const mesLancs=lancs.filter((l:any)=>l.data&&l.data.startsWith(mes));
  const recMes=mesLancs.filter((l:any)=>l.tipo==='receita'&&l.status==='recebido').reduce((s:number,l:any)=>s+(l.valor||0),0);
  const despMes=mesLancs.filter((l:any)=>l.tipo==='despesa'&&l.status==='pago').reduce((s:number,l:any)=>s+(l.valor||0),0);
  const atrasadas=ativs.filter((a:any)=>a.status==='pendente'&&a.data<hj).length;
  const emAnd=projs.filter((p:any)=>p.status==='em_andamento').length;
  const FECHADASPROP=['aprovada','rejeitada','cancelada'];
  const propsAb=props.filter((p:any)=>!FECHADASPROP.includes(p.status));
  const propVal=propsAb.reduce((s:number,p:any)=>s+(p.valor||0),0);
  await send(chatId,[`📈 *Relatório — ${new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}*`,'',`📥 Receita: *${fmt(recMes)}*`,`📤 Despesas: *${fmt(despMes)}*`,`📊 Resultado: *${fmt(recMes-despMes)}*`,'',`🎯 Pipeline: *${fmt(pipeline)}* (${ativos.length} leads)`,`📋 Propostas abertas: *${propsAb.length}* | ${fmt(propVal)}`,`🏗 Projetos em andamento: *${emAnd}*`,`⚠️ Atividades atrasadas: *${atrasadas}*`].join('\n'));
}

// ── Ferramentas Claude ────────────────────────────────────────────────────────
const TOOLS:Anthropic.Tool[]=[
  {name:'buscar_cliente',description:'Busca cliente pelo nome.',input_schema:{type:'object' as const,properties:{nome:{type:'string'}}}},
  {name:'buscar_lead',description:'Busca lead pelo nome. Use antes de atualizar_lead.',input_schema:{type:'object' as const,properties:{nome:{type:'string'}}}},
  {name:'buscar_atividade',description:'Busca atividade pelo título. Use antes de concluir, reagendar ou cancelar.',input_schema:{type:'object' as const,properties:{nome:{type:'string'},data:{type:'string'}}}},
  {name:'buscar_projeto',description:'Busca projeto pelo nome. Use antes de atualizar_projeto.',input_schema:{type:'object' as const,properties:{nome:{type:'string'}}}},
  {name:'buscar_proposta',description:'Busca proposta pelo título ou cliente. Use antes de atualizar_proposta.',input_schema:{type:'object' as const,properties:{nome:{type:'string'}}}},
  {name:'buscar_licitacao',description:'Busca licitação pelo órgão. Use antes de atualizar_licitacao.',input_schema:{type:'object' as const,properties:{orgao:{type:'string'}}}},
  {name:'ver_cliente',description:'Visão 360 do cliente: leads, atividades, propostas e contatos.',input_schema:{type:'object' as const,required:['nome'],properties:{nome:{type:'string'}}}},
  {name:'criar_atividade',description:'Cria reunião, tarefa, follow-up, ligação ou visita.',
    input_schema:{type:'object' as const,required:['titulo','tipo'],properties:{
      titulo:{type:'string'},tipo:{type:'string',enum:['ligacao','email','reuniao','followup','tarefa','visita']},
      data:{type:'string',description:"Padrão: hoje"},hora:{type:'string'},horaFim:{type:'string'},diaInteiro:{type:'boolean'},
      clienteId:{type:'string'},leadId:{type:'string'},descricao:{type:'string'},
      prioridade:{type:'string',enum:['baixa','media','alta']},responsavel:{type:'string'}}},
  },
  {name:'reagendar_atividade',description:'Altera data e/ou horário de uma atividade.',
    input_schema:{type:'object' as const,required:['atividadeId'],properties:{atividadeId:{type:'string'},data:{type:'string'},hora:{type:'string'},horaFim:{type:'string'}}}},
  {name:'concluir_atividade',description:'Marca atividade como concluída.',
    input_schema:{type:'object' as const,required:['atividadeId'],properties:{atividadeId:{type:'string'},observacoes:{type:'string'}}}},
  {name:'cancelar_atividade',description:'Cancela uma atividade.',
    input_schema:{type:'object' as const,required:['atividadeId'],properties:{atividadeId:{type:'string'},motivo:{type:'string'}}}},
  {name:'criar_lead',description:'Cria novo lead no pipeline.',
    input_schema:{type:'object' as const,required:['titulo'],properties:{
      titulo:{type:'string'},clienteId:{type:'string'},valor:{type:'number'},
      servico:{type:'string',description:'NR-12, NR-35, NR-33, Linha de Vida, Laudo, Projeto, Treinamento'},
      status:{type:'string',enum:['lead_identificado','primeiro_contato','qualificacao','proposta_elaboracao','proposta_enviada','negociacao','fechado_ganho','fechado_perdido']},
      responsavel:{type:'string'},origem:{type:'string',enum:['prospecao','indicacao','site','linkedin','evento','retorno']},
      proximaAcao:{type:'string'},dataProxAcao:{type:'string'},observacoes:{type:'string'}}},
  },
  {name:'atualizar_lead',description:'Atualiza status, valor ou próxima ação de um lead.',
    input_schema:{type:'object' as const,required:['leadId'],properties:{
      leadId:{type:'string'},status:{type:'string',enum:['lead_identificado','primeiro_contato','qualificacao','proposta_elaboracao','proposta_enviada','negociacao','fechado_ganho','fechado_perdido']},
      valor:{type:'number'},proximaAcao:{type:'string'},dataProxAcao:{type:'string'},motivoPerda:{type:'string'},observacoes:{type:'string'}}},
  },
  {name:'criar_proposta',description:'Cria proposta comercial.',
    input_schema:{type:'object' as const,required:['titulo'],properties:{
      titulo:{type:'string'},clienteId:{type:'string'},valor:{type:'number'},servico:{type:'string'},
      descricao:{type:'string'},formaPagamento:{type:'string'},prazoExecucao:{type:'string'},
      validade:{type:'string',description:"YYYY-MM-DD ou '30 dias'"},responsavel:{type:'string'},observacoes:{type:'string'}}},
  },
  {name:'atualizar_proposta',description:'Atualiza status de uma proposta.',
    input_schema:{type:'object' as const,required:['propostaId','status'],properties:{
      propostaId:{type:'string'},status:{type:'string',enum:['elaboracao','enviada','negociacao','aprovada','rejeitada','cancelada']},
      valor:{type:'number'},observacoes:{type:'string'}}},
  },
  {name:'criar_projeto',description:'Cria novo projeto (após fechar contrato).',
    input_schema:{type:'object' as const,required:['titulo'],properties:{
      titulo:{type:'string'},clienteId:{type:'string'},leadId:{type:'string'},valor:{type:'number'},
      prazo:{type:'string'},responsavel:{type:'string'},descricao:{type:'string'},observacoes:{type:'string'}}},
  },
  {name:'atualizar_projeto',description:'Atualiza progresso, status ou etapa de um projeto.',
    input_schema:{type:'object' as const,required:['projetoId'],properties:{
      projetoId:{type:'string'},status:{type:'string',enum:['planejamento','em_andamento','pausado','concluido','cancelado']},
      progresso:{type:'number'},etapaAtual:{type:'string'},prazo:{type:'string'},observacoes:{type:'string'}}},
  },
  {name:'criar_cliente',description:'Cadastra novo cliente.',
    input_schema:{type:'object' as const,required:['nome'],properties:{
      nome:{type:'string'},cnpj:{type:'string'},cidade:{type:'string'},estado:{type:'string'},
      segmento:{type:'string'},telefone:{type:'string'},email:{type:'string'},responsavel:{type:'string'},observacoes:{type:'string'}}},
  },
  {name:'atualizar_cliente',description:'Atualiza dados de um cliente existente.',
    input_schema:{type:'object' as const,required:['clienteId'],properties:{
      clienteId:{type:'string'},nome:{type:'string'},cnpj:{type:'string'},cidade:{type:'string'},
      estado:{type:'string'},segmento:{type:'string'},telefone:{type:'string'},
      email:{type:'string'},responsavel:{type:'string'},observacoes:{type:'string'}}},
  },
  {name:'criar_contato',description:'Cadastra novo contato.',
    input_schema:{type:'object' as const,required:['nome'],properties:{
      nome:{type:'string'},clienteId:{type:'string'},cargo:{type:'string'},email:{type:'string'},telefone:{type:'string'},observacoes:{type:'string'}}},
  },
  {name:'registrar_recebimento',description:'Registra entrada de pagamento/receita.',
    input_schema:{type:'object' as const,required:['descricao','valor'],properties:{
      descricao:{type:'string'},valor:{type:'number'},clienteId:{type:'string'},data:{type:'string'},observacoes:{type:'string'}}},
  },
  {name:'registrar_despesa',description:'Registra saída/pagamento de despesa.',
    input_schema:{type:'object' as const,required:['descricao','valor'],properties:{
      descricao:{type:'string'},valor:{type:'number'},
      fornecedor:{type:'string',description:'Nome do fornecedor'},
      categoria:{type:'string',description:'Fornecedor, Aluguel, Material, Transporte, Impostos, Outros'},
      data:{type:'string'},observacoes:{type:'string'}}},
  },
  {name:'criar_licitacao',description:'Cadastra nova licitação.',
    input_schema:{type:'object' as const,required:['orgao'],properties:{
      orgao:{type:'string'},numero:{type:'string'},objeto:{type:'string'},
      valor:{type:'number'},dataAbertura:{type:'string'},modalidade:{type:'string'},observacoes:{type:'string'}}},
  },
  {name:'atualizar_licitacao',description:'Atualiza status de uma licitação.',
    input_schema:{type:'object' as const,required:['licitacaoId','status'],properties:{
      licitacaoId:{type:'string'},
      status:{type:'string',enum:['em_analise','participando','classificado','ganhou','perdeu','cancelada','deserto']},
      observacoes:{type:'string'}}},
  },
];

// ── Executor de ferramentas ───────────────────────────────────────────────────
async function runTool(name:string,input:Record<string,any>):Promise<string>{
  const hj=today();
  try{
    switch(name){

      case 'buscar_cliente':{
        const rows=await sbSearch('clientes','nome',input.nome||'');
        if(!rows.length)return `Nenhum cliente encontrado com "${input.nome}".`;
        return rows.map((c:any)=>`• ${c.nome}${c.cidade?' ('+c.cidade+')':''}${c.segmento?' | '+c.segmento:''}\n  ID: ${c.id}`).join('\n');
      }

      case 'buscar_lead':{
        const todos=await sbAll('leads');
        const rows=todos.filter((l:any)=>l.titulo&&l.titulo.toLowerCase().includes((input.nome||'').toLowerCase())).slice(0,4);
        if(!rows.length)return `Nenhum lead encontrado com "${input.nome}".`;
        return rows.map((l:any)=>`• ${l.titulo} | ${l.status}${l.valorEstimado?' | '+fmt(l.valorEstimado):''}\n  ID: ${l.id}`).join('\n');
      }

      case 'buscar_atividade':{
        const todas=await sbAll('atividades');
        let rows=todas;
        if(input.nome)rows=rows.filter((a:any)=>a.titulo&&a.titulo.toLowerCase().includes(input.nome.toLowerCase()));
        if(input.data)rows=rows.filter((a:any)=>a.data===parseDatePT(input.data));
        rows=rows.sort((a:any,b:any)=>(b.data||'').localeCompare(a.data||'')).slice(0,5);
        if(!rows.length)return 'Nenhuma atividade encontrada.';
        return rows.map((a:any)=>`• [${a.status}] ${a.titulo} — ${a.data}${a.hora?' '+a.hora:''}\n  ID: ${a.id}`).join('\n');
      }

      case 'buscar_projeto':{
        const todos=await sbAll('projetos');
        const rows=todos.filter((p:any)=>p.titulo&&p.titulo.toLowerCase().includes((input.nome||'').toLowerCase())).slice(0,4);
        if(!rows.length)return 'Nenhum projeto encontrado.';
        return rows.map((p:any)=>`• ${p.titulo} | ${p.status}${p.progresso!==undefined?' | '+p.progresso+'%':''}${p.prazo?' | prazo '+p.prazo:''}\n  ID: ${p.id}`).join('\n');
      }

      case 'buscar_proposta':{
        const todas=await sbAll('propostas');
        let rows=todas.filter((p:any)=>p.titulo&&p.titulo.toLowerCase().includes((input.nome||'').toLowerCase())).slice(0,4);
        if(!rows.length){
          // tenta por cliente
          const cls=await sbSearch('clientes','nome',input.nome||'',1);
          if(cls.length)rows=todas.filter((p:any)=>p.clienteId===cls[0].id).slice(0,4);
        }
        if(!rows.length)return `Nenhuma proposta encontrada com "${input.nome}".`;
        return rows.map((p:any)=>`• ${p.titulo} | ${p.status}${p.valor?' | '+fmt(p.valor):''}${p.validade?' | val. '+p.validade:''}\n  ID: ${p.id}`).join('\n');
      }

      case 'buscar_licitacao':{
        const todas=await sbAll('licitacoes');
        const rows=todas.filter((l:any)=>l.orgao&&l.orgao.toLowerCase().includes((input.orgao||'').toLowerCase())).slice(0,4);
        if(!rows.length)return `Nenhuma licitação encontrada com "${input.orgao}".`;
        return rows.map((l:any)=>`• ${l.orgao}${l.numero?' ('+l.numero+')':''} | ${l.status}${l.dataAbertura?' | '+l.dataAbertura:''}\n  ID: ${l.id}`).join('\n');
      }

      case 'ver_cliente':{
        const cls=await sbSearch('clientes','nome',input.nome,1);
        if(!cls.length)return `Cliente "${input.nome}" não encontrado.`;
        const cl=cls[0];
        const FECHADOS=['fechado_ganho','executado','fechado_perdido'];
        const todas=await sbAll('leads');const tAtivs=await sbAll('atividades');const tProps=await sbAll('propostas');const tCont=await sbAll('contatos');
        const lAtivos=todas.filter((l:any)=>l.clienteId===cl.id&&!FECHADOS.includes(l.status)).slice(0,5);
        const recentes=tAtivs.filter((a:any)=>a.clienteId===cl.id).sort((a:any,b:any)=>(b.data||'').localeCompare(a.data||'')).slice(0,5);
        const props=tProps.filter((p:any)=>p.clienteId===cl.id&&!['rejeitada','cancelada'].includes(p.status)).slice(0,4);
        const conts=tCont.filter((c:any)=>c.clienteId===cl.id).slice(0,5);
        const lines=[`🏢 *${cl.nome}*${cl.cidade?' — '+cl.cidade:''}${cl.segmento?' | '+cl.segmento:''}`,cl.telefone?`📞 ${cl.telefone}`:'',cl.email?`📧 ${cl.email}`:'',''];
        if(conts.length){lines.push('*Contatos:*');conts.forEach((c:any)=>lines.push(`• ${c.nome}${c.cargo?' ('+c.cargo+')':''}${c.telefone?' — '+c.telefone:''}`));lines.push('');}
        if(lAtivos.length){lines.push('*Leads ativos:*');lAtivos.forEach((l:any)=>lines.push(`• ${l.titulo} | ${l.status}${l.valorEstimado?' | '+fmt(l.valorEstimado):''}`));lines.push('');}
        if(recentes.length){lines.push('*Atividades recentes:*');recentes.forEach((a:any)=>lines.push(`• [${a.status}] ${a.titulo} — ${a.data}`));lines.push('');}
        if(props.length){lines.push('*Propostas:*');props.forEach((p:any)=>lines.push(`• ${p.titulo} | ${p.status}${p.valor?' | '+fmt(p.valor):''}`))}
        if(!lAtivos.length&&!recentes.length&&!props.length&&!conts.length)lines.push('Nenhum registro vinculado ainda.');
        return lines.filter(l=>l!=='').join('\n');
      }

      case 'criar_atividade':{
        const EMOJI:Record<string,string>={ligacao:'📞',email:'📧',reuniao:'🤝',followup:'🔄',tarefa:'✅',visita:'🏭'};
        const obj:Record<string,any>={id:genId(),titulo:input.titulo,tipo:input.tipo||'followup',data:parseDatePT(input.data||'hoje'),hora:input.diaInteiro?'':(input.hora||''),horaFim:input.horaFim||'',diaInteiro:input.diaInteiro||false,status:'pendente',prioridade:input.prioridade||'media',clienteId:input.clienteId||'',leadId:input.leadId||'',descricao:input.descricao||'',responsavel:input.responsavel||'',createdAt:new Date().toISOString()};
        await sbSave('atividades',obj);
        return `✅ ${EMOJI[obj.tipo]||'📌'} "${obj.titulo}" — ${obj.data}${obj.hora?' às '+obj.hora:''}`;
      }

      case 'reagendar_atividade':{
        const existing=await sbRead('atividades',input.atividadeId);
        if(!existing)return 'Atividade não encontrada.';
        if(input.data)existing.data=parseDatePT(input.data);
        if(input.hora)existing.hora=input.hora;
        if(input.horaFim)existing.horaFim=input.horaFim;
        await sbSave('atividades',existing);
        return `✅ Reagendado para ${existing.data}${existing.hora?' às '+existing.hora:''}`;
      }

      case 'concluir_atividade':{
        const existing=await sbRead('atividades',input.atividadeId);
        if(!existing)return 'Atividade não encontrada.';
        existing.status='concluida';
        existing.dataConclusao=hj;
        if(input.observacoes)existing.observacoes=input.observacoes;
        await sbSave('atividades',existing);
        return `✅ Atividade concluída!${input.observacoes?' — '+input.observacoes:''}`;
      }

      case 'cancelar_atividade':{
        const existing=await sbRead('atividades',input.atividadeId);
        if(!existing)return 'Atividade não encontrada.';
        existing.status='cancelada';
        if(input.motivo)existing.observacoes=input.motivo;
        await sbSave('atividades',existing);
        return `🚫 Cancelada${input.motivo?' — '+input.motivo:''}`;
      }

      case 'criar_lead':{
        const obj:Record<string,any>={id:genId(),titulo:input.titulo,clienteId:input.clienteId||'',status:input.status||'qualificacao',valorEstimado:input.valor||0,servico:input.servico||'',responsavel:input.responsavel||'',origem:input.origem||'prospecao',proximaAcao:input.proximaAcao||'',dataProximaAcao:parseDatePT(input.dataProxAcao||addDays(3)),observacoes:input.observacoes||'',createdAt:new Date().toISOString()};
        await sbSave('leads',obj);
        return `✅ Lead: "${obj.titulo}" | ${obj.status}${obj.valorEstimado?' | '+fmt(obj.valorEstimado):''}`;
      }

      case 'atualizar_lead':{
        const existing=await sbRead('leads',input.leadId);
        if(!existing)return 'Lead não encontrado.';
        if(input.status!==undefined)existing.status=input.status;
        if(input.valor!==undefined)existing.valorEstimado=input.valor;
        if(input.proximaAcao!==undefined)existing.proximaAcao=input.proximaAcao;
        if(input.dataProxAcao)existing.dataProximaAcao=parseDatePT(input.dataProxAcao);
        if(input.motivoPerda)existing.motivoPerda=input.motivoPerda;
        if(input.observacoes)existing.observacoes=(existing.observacoes?existing.observacoes+'\n':'')+input.observacoes;
        existing.dataMudancaStatus=hj;
        await sbSave('leads',existing);
        return `✅ Lead${input.status?' → '+input.status:' atualizado'}`;
      }

      case 'criar_proposta':{
        let validade=addDays(30);
        if(input.validade){if(/\d+\s*dia/.test(input.validade))validade=addDays(parseInt(input.validade)||30);else validade=parseDatePT(input.validade);}
        const obj:Record<string,any>={id:genId(),titulo:input.titulo,clienteId:input.clienteId||'',valor:input.valor||0,status:'elaboracao',servico:input.servico||'',descricao:input.descricao||'',formaPagamento:input.formaPagamento||'',prazoExecucao:input.prazoExecucao||'',validade,responsavel:input.responsavel||'',observacoes:input.observacoes||'',createdAt:new Date().toISOString()};
        await sbSave('propostas',obj);
        return `✅ Proposta: "${obj.titulo}"${obj.valor?' | '+fmt(obj.valor):''} | val. ${obj.validade}\nID: ${obj.id}`;
      }

      case 'atualizar_proposta':{
        const existing=await sbRead('propostas',input.propostaId);
        if(!existing)return 'Proposta não encontrada.';
        existing.status=input.status;
        if(input.valor!==undefined)existing.valor=input.valor;
        if(input.observacoes)existing.observacoes=input.observacoes;
        await sbSave('propostas',existing);
        const SL:Record<string,string>={aprovada:'✅ Aprovada',rejeitada:'❌ Rejeitada',enviada:'📤 Enviada',negociacao:'🤝 Em Negociação',cancelada:'🚫 Cancelada',elaboracao:'✏️ Em Elaboração'};
        return `✅ Proposta → ${SL[input.status]||input.status}`;
      }

      case 'criar_projeto':{
        const obj:Record<string,any>={id:genId(),titulo:input.titulo,clienteId:input.clienteId||'',leadId:input.leadId||'',valor:input.valor||0,status:'em_andamento',progresso:0,prazo:input.prazo?parseDatePT(input.prazo):'',responsavel:input.responsavel||'',descricao:input.descricao||'',observacoes:input.observacoes||'',createdAt:new Date().toISOString()};
        await sbSave('projetos',obj);
        return `✅ Projeto: "${obj.titulo}"${obj.prazo?' | prazo '+obj.prazo:''}\nID: ${obj.id}`;
      }

      case 'atualizar_projeto':{
        const existing=await sbRead('projetos',input.projetoId);
        if(!existing)return 'Projeto não encontrado.';
        if(input.status!==undefined)existing.status=input.status;
        if(input.progresso!==undefined)existing.progresso=input.progresso;
        if(input.etapaAtual)existing.etapaAtual=input.etapaAtual;
        if(input.prazo)existing.prazo=parseDatePT(input.prazo);
        if(input.observacoes)existing.observacoes=input.observacoes;
        await sbSave('projetos',existing);
        const parts:string[]=[];
        if(input.status)parts.push(`status → ${input.status}`);
        if(input.progresso!==undefined)parts.push(`${input.progresso}%`);
        if(input.etapaAtual)parts.push(`etapa: ${input.etapaAtual}`);
        return `✅ Projeto: ${parts.join(' | ')||'atualizado'}`;
      }

      case 'criar_cliente':{
        const obj:Record<string,any>={id:genId(),nome:input.nome,cnpj:input.cnpj||'',cidade:input.cidade||'',estado:input.estado||'',segmento:input.segmento||'',telefone:input.telefone||'',email:input.email||'',responsavel:input.responsavel||'',observacoes:input.observacoes||'',status:'ativo',createdAt:new Date().toISOString()};
        await sbSave('clientes',obj);
        return `✅ Cliente: "${obj.nome}"${obj.cidade?' — '+obj.cidade:''}\nID: ${obj.id}`;
      }

      case 'atualizar_cliente':{
        const existing=await sbRead('clientes',input.clienteId);
        if(!existing)return 'Cliente não encontrado.';
        const campos=['nome','cnpj','cidade','estado','segmento','telefone','email','responsavel','observacoes'];
        const updated:string[]=[];
        campos.forEach(c=>{if(input[c]!==undefined){existing[c]=input[c];updated.push(c);}});
        if(!updated.length)return 'Nenhum campo para atualizar.';
        await sbSave('clientes',existing);
        return `✅ Cliente atualizado: ${updated.join(', ')}`;
      }

      case 'criar_contato':{
        const obj:Record<string,any>={id:genId(),nome:input.nome,clienteId:input.clienteId||'',cargo:input.cargo||'',email:input.email||'',telefone:input.telefone||'',observacoes:input.observacoes||'',createdAt:new Date().toISOString()};
        await sbSave('contatos',obj);
        return `✅ Contato: "${obj.nome}"${obj.cargo?' ('+obj.cargo+')':''}`;
      }

      case 'registrar_recebimento':{
        const obj:Record<string,any>={id:genId(),tipo:'receita',descricao:input.descricao,valor:input.valor,status:'recebido',data:parseDatePT(input.data||today()),clienteId:input.clienteId||'',observacoes:input.observacoes||'',createdAt:new Date().toISOString()};
        await sbSave('lancamentos',obj);
        return `✅ Recebimento: ${fmt(obj.valor)} — "${obj.descricao}" em ${obj.data}`;
      }

      case 'registrar_despesa':{
        const desc=input.fornecedor?`${input.descricao} (${input.fornecedor})`:input.descricao;
        const obj:Record<string,any>={id:genId(),tipo:'despesa',descricao:desc,valor:input.valor,status:'pago',categoria:input.categoria||'Outros',data:parseDatePT(input.data||today()),observacoes:input.observacoes||'',createdAt:new Date().toISOString()};
        await sbSave('lancamentos',obj);
        return `✅ Despesa: ${fmt(obj.valor)} — "${obj.descricao}" em ${obj.data}`;
      }

      case 'criar_licitacao':{
        const obj:Record<string,any>={id:genId(),orgao:input.orgao,numero:input.numero||'',objeto:input.objeto||'',valor:input.valor||0,dataAbertura:input.dataAbertura?parseDatePT(input.dataAbertura):'',modalidade:input.modalidade||'',status:'em_analise',observacoes:input.observacoes||'',createdAt:new Date().toISOString()};
        await sbSave('licitacoes',obj);
        return `✅ Licitação: "${obj.orgao}"${obj.dataAbertura?' | abertura '+obj.dataAbertura:''}\nID: ${obj.id}`;
      }

      case 'atualizar_licitacao':{
        const existing=await sbRead('licitacoes',input.licitacaoId);
        if(!existing)return 'Licitação não encontrada.';
        existing.status=input.status;
        if(input.observacoes)existing.observacoes=input.observacoes;
        await sbSave('licitacoes',existing);
        const SL:Record<string,string>={ganhou:'🏆 Ganhamos!',perdeu:'🟡 Perdida',cancelada:'🚫 Cancelada',em_analise:'🔍 Em Análise',participando:'📊 Participando',classificado:'✅ Classificados',deserto:'❌ Deserto'};
        return `${SL[input.status]||'✅'} Licitação → ${input.status}`;
      }

      default:return `Ferramenta "${name}" não reconhecida.`;
    }
  }catch(e:any){console.error(`Erro ${name}:`,e);return `Erro: ${e.message}`;}
}

// ── Claude ────────────────────────────────────────────────────────────────────
async function processarComClaude(chatId:string,texto:string):Promise<void>{
  if(!ANTHROPIC){await send(chatId,'⚠️ API key não configurada.');return;}
  const client=new Anthropic({apiKey:ANTHROPIC});
  const hoje=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  const system=`Você é o assistente CRM 24/7 da Bikows Engenharia — NR-12, NR-35, NR-33, Linha de Vida, laudos e treinamentos.
Hoje é ${hoje}.

PRINCÍPIO: Age imediatamente. Não peça confirmação antes de agir.

DEFAULTS:
- Data → hoje | Hora → sem horário | Cliente não encontrado → cria sem vínculo
- Tipo: reunião→reuniao, ligar→ligacao, visita→visita, enviar/fazer→tarefa, follow→followup
- Status lead → qualificacao | Prioridade → media

MAPEAMENTO:
- reunião/visita/ligação → criar_atividade
- reagenda/adiou → buscar_atividade + reagendar_atividade
- cancela → buscar_atividade + cancelar_atividade
- concluí/fiz → buscar_atividade + concluir_atividade
- como está X → ver_cliente
- fechar contrato → buscar_lead + atualizar_lead(fechado_ganho)
- abrir projeto → criar_projeto
- proposta aprovada/enviada → buscar_proposta + atualizar_proposta
- ganhamos/perdemos licitação → buscar_licitacao + atualizar_licitacao
- recebi/pagamento → registrar_recebimento
- paguei/despesa → registrar_despesa
- nova licitação → criar_licitacao
- atualiza dado de cliente → buscar_cliente + atualizar_cliente
- Memória: use o histórico para entender "aquela reunião", "o lead que criei", etc.

REGRAS:
1. Age imediatamente. Nunca pergunte antes de agir.
2. buscar_cliente é OPCIONAL. Se não achar, cria sem vínculo.
3. Múltiplas ações: execute todas em sequência.
4. Resposta: 1-2 linhas com emoji.
5. Só pergunte se ABSOLUTAMENTE impossível inferir.

PIPELINE: lead_identificado→primeiro_contato→qualificacao→proposta_elaboracao→proposta_enviada→negociacao→fechado_ganho/perdido`;

  const history=await loadHistory(chatId);
  const messages:Anthropic.MessageParam[]=[...history,{role:'user',content:texto}];
  let finalText='';

  for(let i=0;i<10;i++){
    const resp=await client.messages.create({
      model:'claude-sonnet-4-6',max_tokens:1024,
      system,tools:TOOLS,messages,
    });
    if(resp.stop_reason==='end_turn'){
      const txt=resp.content.find((c:any)=>c.type==='text');
      finalText=(txt as any)?.text||'';
      if(finalText)await send(chatId,finalText);
      await saveHistory(chatId,texto,finalText);
      return;
    }
    if(resp.stop_reason==='tool_use'){
      messages.push({role:'assistant',content:resp.content});
      const results:Anthropic.ToolResultBlockParam[]=[];
      for(const b of resp.content){
        if(b.type==='tool_use'){
          const out=await runTool(b.name,b.input as Record<string,any>);
          results.push({type:'tool_result',tool_use_id:b.id,content:out});
        }
      }
      messages.push({role:'user',content:results});
      continue;
    }
    break;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async(req:Request)=>{
  // Primeira requisição depois de um deploy registra o webhook com o
  // secret_token. Sem isto, o porteiro abaixo recusaria tudo para sempre.
  const reg=await garantirWebhookRegistrado();

  // GET devolve só o estado do webhook (nenhum segredo), para conferir o
  // deploy sem precisar mandar mensagem no Telegram.
  if(req.method!=='POST'){
    return new Response(JSON.stringify({
      funcao:'crm-telegram-bot', versao:15,
      webhook: reg || 'ja verificado nesta instancia',
    }),{headers:{'Content-Type':'application/json'}});
  }

  // Rota administrativa: registra o webhook no Telegram com o secret_token.
  // Fica antes do porteiro do webhook porque usa o segredo do cron.
  const rota=new URL(req.url).searchParams.get('acao');
  if(rota==='configurar-webhook')return await configurarWebhook(req);

  // PORTEIRO: só o Telegram conhece o secret_token registrado no setWebhook.
  // Responde 200 para não dar pista a quem está sondando, mas não executa nada.
  if(!(await webhookAutorizado(req))){
    console.warn('[seguranca] POST recusado: secret_token ausente ou invalido');
    return new Response('OK');
  }

  let body:any;
  try{body=await req.json();}catch{return new Response('OK');}
  const msg=body?.message||body?.edited_message;
  if(!msg?.text||!msg?.chat?.id)return new Response('OK');
  const chatId=String(msg.chat.id);
  const text=String(msg.text).trim();

  // Só os chats cadastrados comandam o CRM. Mesmo com o secret correto, uma
  // pessoa que encontrasse o bot no Telegram poderia consultar e gravar dados.
  if(!(await chatAutorizado(chatId))){
    console.warn('[seguranca] chat nao autorizado:',chatId);
    await send(chatId,'🔒 Este assistente é de uso interno da Bikows Engenharia e não está liberado para este contato.');
    return new Response('OK');
  }

  const cmd=text.split(' ')[0].toLowerCase();
  if(cmd==='/start'||cmd==='/ajuda'||cmd==='/help'){await cmdStart(chatId);return new Response('OK');}
  if(cmd==='/limpar'){await clearHistory(chatId);await send(chatId,'🧹 Contexto limpo!');return new Response('OK');}
  if(cmd==='/hoje')      {await typing(chatId);await cmdHoje(chatId);      return new Response('OK');}
  if(cmd==='/semana')    {await typing(chatId);await cmdSemana(chatId);    return new Response('OK');}
  if(cmd==='/pipeline')  {await typing(chatId);await cmdPipeline(chatId);  return new Response('OK');}
  if(cmd==='/financeiro'){await typing(chatId);await cmdFinanceiro(chatId);return new Response('OK');}
  if(cmd==='/projetos')  {await typing(chatId);await cmdProjetos(chatId);  return new Response('OK');}
  if(cmd==='/propostas') {await typing(chatId);await cmdPropostas(chatId); return new Response('OK');}
  if(cmd==='/licitacoes'){await typing(chatId);await cmdLicitacoes(chatId);return new Response('OK');}
  if(cmd==='/pendencias'){await typing(chatId);await cmdPendencias(chatId);return new Response('OK');}
  if(cmd==='/relatorio') {await typing(chatId);await cmdRelatorio(chatId); return new Response('OK');}
  await typing(chatId);
  await processarComClaude(chatId,text);
  return new Response('OK');
});
