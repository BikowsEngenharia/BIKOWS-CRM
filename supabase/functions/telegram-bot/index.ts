/**
 * Bikows CRM — Telegram Bot
 * Supabase Edge Function (Deno runtime)
 *
 * Permite criar/consultar leads, atividades, propostas e mais
 * via linguagem natural no Telegram, usando Claude Sonnet como
 * motor de interpretação + tool use.
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.27.3";

// ── Variáveis de ambiente ────────────────────────────────────────────────────
const TELEGRAM_TOKEN    = Deno.env.get("TELEGRAM_TOKEN")!;
const ANTHROPIC_KEY     = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// IDs de chat Telegram autorizados (ex: "123456789,987654321")
const ALLOWED_IDS       = (Deno.env.get("ALLOWED_CHAT_IDS") || "").split(",").map(s => s.trim()).filter(Boolean);

const TG = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().split("T")[0];
}

function parseDatePT(d: string): string {
  if (!d) return todayStr();
  if (d.match(/^\d{4}-\d{2}-\d{2}$/)) return d;
  const l = d.toLowerCase().trim();
  if (l === "hoje")           return todayStr();
  if (l === "amanhã" || l === "amanha") return addDays(1);
  if (l === "depois de amanhã" || l === "depois de amanha") return addDays(2);
  if (l === "segunda")  { return _proximoDia(1); }
  if (l === "terça" || l === "terca")    { return _proximoDia(2); }
  if (l === "quarta")   { return _proximoDia(3); }
  if (l === "quinta")   { return _proximoDia(4); }
  if (l === "sexta")    { return _proximoDia(5); }
  // dd/mm/yyyy
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return todayStr();
}

function _proximoDia(dow: number): string {
  const d = new Date(); let diff = dow - d.getDay();
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function formatCurrency(v: number): string {
  return "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

// ── Supabase REST ─────────────────────────────────────────────────────────────

async function sbGet(table: string, params = ""): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: SUPABASE_SVC_KEY,
      Authorization: `Bearer ${SUPABASE_SVC_KEY}`,
    },
  });
  return r.json();
}

async function sbInsert(table: string, body: object): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SVC_KEY,
      Authorization: `Bearer ${SUPABASE_SVC_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function sbPatch(table: string, params: string, body: object): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SVC_KEY,
      Authorization: `Bearer ${SUPABASE_SVC_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
}

// ── Ferramentas disponíveis para Claude ───────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "buscar_clientes",
    description: "Busca clientes no CRM pelo nome. Use antes de criar leads/atividades para encontrar o ID correto.",
    input_schema: {
      type: "object" as const,
      properties: {
        nome: { type: "string", description: "Nome ou parte do nome da empresa" },
      },
    },
  },
  {
    name: "buscar_leads",
    description: "Busca leads no pipeline por nome ou status",
    input_schema: {
      type: "object" as const,
      properties: {
        nome:   { type: "string", description: "Parte do título do lead" },
        status: { type: "string", description: "Status do lead (opcional)" },
      },
    },
  },
  {
    name: "criar_lead",
    description: "Cria uma nova oportunidade/lead no pipeline de vendas do CRM",
    input_schema: {
      type: "object" as const,
      required: ["titulo"],
      properties: {
        titulo:        { type: "string",  description: "Título descritivo (ex: NR-12 — Empresa ABC)" },
        clienteId:     { type: "string",  description: "ID do cliente (obtenha com buscar_clientes)" },
        valor:         { type: "number",  description: "Valor estimado em reais" },
        servico:       { type: "string",  description: "Serviço: NR-12, NR-35, NR-33, Linha de Vida, Laudo, Projeto, Treinamento" },
        status:        { type: "string",  description: "Estágio no pipeline", enum: ["lead_identificado","primeiro_contato","qualificacao","proposta_elaboracao","proposta_enviada","negociacao","fechado_ganho","fechado_perdido"] },
        responsavel:   { type: "string",  description: "Nome do responsável pela oportunidade" },
        origem:        { type: "string",  description: "Como surgiu o lead", enum: ["prospecao","indicacao","site","linkedin","evento","retorno"] },
        proximaAcao:   { type: "string",  description: "O que fazer de próximo" },
        dataProxAcao:  { type: "string",  description: "Data da próxima ação (YYYY-MM-DD, 'hoje', 'amanhã', dia da semana)" },
        observacoes:   { type: "string",  description: "Anotações adicionais" },
      },
    },
  },
  {
    name: "atualizar_lead",
    description: "Atualiza status, valor ou próxima ação de um lead existente",
    input_schema: {
      type: "object" as const,
      required: ["leadId"],
      properties: {
        leadId:       { type: "string", description: "ID do lead (obtenha com buscar_leads)" },
        status:       { type: "string", enum: ["lead_identificado","primeiro_contato","qualificacao","proposta_elaboracao","proposta_enviada","negociacao","fechado_ganho","fechado_perdido"] },
        valor:        { type: "number" },
        proximaAcao:  { type: "string" },
        dataProxAcao: { type: "string", description: "YYYY-MM-DD ou 'amanhã' etc." },
        motivoPerda:  { type: "string", description: "Preencher se status = fechado_perdido" },
        observacoes:  { type: "string" },
      },
    },
  },
  {
    name: "criar_atividade",
    description: "Cria tarefa, follow-up, reunião, ligação ou visita no CRM",
    input_schema: {
      type: "object" as const,
      required: ["titulo", "tipo", "data"],
      properties: {
        titulo:      { type: "string" },
        tipo:        { type: "string", enum: ["ligacao","email","reuniao","followup","tarefa","visita"] },
        data:        { type: "string", description: "YYYY-MM-DD ou 'hoje', 'amanhã', 'quinta'..." },
        hora:        { type: "string", description: "HH:MM (ex: 14:00)" },
        horaFim:     { type: "string", description: "Hora fim opcional (HH:MM)" },
        diaInteiro:  { type: "boolean", description: "true se for o dia todo" },
        clienteId:   { type: "string" },
        leadId:      { type: "string" },
        descricao:   { type: "string" },
        prioridade:  { type: "string", enum: ["baixa","media","alta"] },
        responsavel: { type: "string" },
      },
    },
  },
  {
    name: "criar_proposta",
    description: "Cria uma proposta comercial no CRM",
    input_schema: {
      type: "object" as const,
      required: ["titulo"],
      properties: {
        titulo:        { type: "string" },
        clienteId:     { type: "string" },
        valor:         { type: "number" },
        servico:       { type: "string" },
        descricao:     { type: "string" },
        formaPagamento:{ type: "string" },
        prazoExecucao: { type: "string" },
        validade:      { type: "string", description: "YYYY-MM-DD ou '30 dias'" },
        responsavel:   { type: "string" },
        observacoes:   { type: "string" },
      },
    },
  },
  {
    name: "listar_hoje",
    description: "Lista atividades pendentes de hoje e atrasadas",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "listar_pipeline",
    description: "Mostra resumo do funil de vendas por estágio",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "listar_pendencias",
    description: "Lista atividades atrasadas, follow-ups vencidos e parcelas em atraso",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "relatorio_rapido",
    description: "Resumo executivo: receita do mês, leads ativos, atividades pendentes",
    input_schema: { type: "object" as const, properties: {} },
  },
];

// ── Executor de ferramentas ───────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  const today = todayStr();

  try {
    switch (name) {

      case "buscar_clientes": {
        const q = encodeURIComponent(`%${input.nome || ""}%`);
        const rows = await sbGet("clientes", `nome=ilike.${q}&select=id,nome,cnpj,segmento,cidade&limit=5`);
        if (!rows?.length) return "Nenhum cliente encontrado com esse nome.";
        return rows.map((c: any) => `• ${c.nome}${c.cidade ? " (" + c.cidade + ")" : ""}\n  ID: ${c.id}`).join("\n");
      }

      case "buscar_leads": {
        let p = "select=id,titulo,status,valorEstimado&limit=5&order=createdAt.desc";
        if (input.nome)   p += `&titulo=ilike.*${encodeURIComponent(input.nome)}*`;
        if (input.status) p += `&status=eq.${input.status}`;
        const rows = await sbGet("leads", p);
        if (!rows?.length) return "Nenhum lead encontrado.";
        const labels: Record<string,string> = {
          lead_identificado:"Lead Identificado", primeiro_contato:"1º Contato",
          qualificacao:"Qualificação", proposta_elaboracao:"Proposta em Elaboração",
          proposta_enviada:"Proposta Enviada", negociacao:"Negociação",
          fechado_ganho:"✅ Fechado/Ganho", fechado_perdido:"❌ Fechado/Perdido",
        };
        return rows.map((l: any) => `• ${l.titulo}\n  ${labels[l.status] || l.status}${l.valorEstimado ? " — " + formatCurrency(l.valorEstimado) : ""}\n  ID: ${l.id}`).join("\n");
      }

      case "criar_lead": {
        const obj = {
          id:              genId(),
          titulo:          input.titulo,
          clienteId:       input.clienteId || "",
          status:          input.status || "qualificacao",
          valorEstimado:   input.valor || 0,
          servico:         input.servico || "",
          responsavel:     input.responsavel || "",
          origem:          input.origem || "prospecao",
          proximaAcao:     input.proximaAcao || "",
          dataProximaAcao: parseDatePT(input.dataProxAcao || addDays(3)),
          observacoes:     input.observacoes || "",
          createdAt:       new Date().toISOString(),
        };
        await sbInsert("leads", obj);
        const statusLabels: Record<string,string> = {
          qualificacao: "Qualificação", proposta_elaboracao: "Proposta em Elaboração",
          proposta_enviada: "Proposta Enviada", negociacao: "Negociação",
        };
        return `Lead criado ✅\nTítulo: ${obj.titulo}\nEstágio: ${statusLabels[obj.status] || obj.status}${obj.valorEstimado ? "\nValor: " + formatCurrency(obj.valorEstimado) : ""}\nPróx. ação: ${obj.dataProximaAcao}`;
      }

      case "atualizar_lead": {
        const patch: Record<string,any> = { dataMudancaStatus: today };
        if (input.status)       patch.status          = input.status;
        if (input.valor)        patch.valorEstimado   = input.valor;
        if (input.proximaAcao)  patch.proximaAcao     = input.proximaAcao;
        if (input.dataProxAcao) patch.dataProximaAcao = parseDatePT(input.dataProxAcao);
        if (input.motivoPerda)  patch.motivoPerda     = input.motivoPerda;
        if (input.observacoes)  patch.observacoes     = input.observacoes;
        await sbPatch("leads", `id=eq.${input.leadId}`, patch);
        return `Lead atualizado ✅${input.status ? "\nNovo status: " + input.status : ""}`;
      }

      case "criar_atividade": {
        const obj = {
          id:          genId(),
          titulo:      input.titulo,
          tipo:        input.tipo || "followup",
          data:        parseDatePT(input.data),
          hora:        input.hora || (input.diaInteiro ? "" : "09:00"),
          horaFim:     input.horaFim || "",
          diaInteiro:  input.diaInteiro || false,
          status:      "pendente",
          prioridade:  input.prioridade || "media",
          clienteId:   input.clienteId || "",
          leadId:      input.leadId || "",
          descricao:   input.descricao || "",
          responsavel: input.responsavel || "",
          createdAt:   new Date().toISOString(),
        };
        await sbInsert("atividades", obj);
        const tipoEmoji: Record<string,string> = {
          ligacao:"📞", email:"📧", reuniao:"🤝", followup:"🔄", tarefa:"✅", visita:"🏭",
        };
        const horaStr = obj.diaInteiro ? "Dia inteiro" : obj.hora + (obj.horaFim ? "–" + obj.horaFim : "");
        return `Atividade criada ✅\n${tipoEmoji[obj.tipo] || "📌"} ${obj.titulo}\n📅 ${obj.data} ${horaStr}`;
      }

      case "criar_proposta": {
        // Calcular validade
        let validade = "";
        if (input.validade) {
          if (input.validade.includes("dia")) {
            const n = parseInt(input.validade);
            validade = addDays(isNaN(n) ? 30 : n);
          } else {
            validade = parseDatePT(input.validade);
          }
        } else {
          validade = addDays(30);
        }
        const obj = {
          id:             genId(),
          titulo:         input.titulo,
          clienteId:      input.clienteId || "",
          valor:          input.valor || 0,
          status:         "elaboracao",
          descricao:      input.descricao || "",
          formaPagamento: input.formaPagamento || "",
          prazoExecucao:  input.prazoExecucao || "",
          validade,
          responsavel:    input.responsavel || "",
          observacoes:    input.observacoes || "",
          createdAt:      new Date().toISOString(),
        };
        await sbInsert("propostas", obj);
        return `Proposta criada ✅\n${obj.titulo}${obj.valor ? "\nValor: " + formatCurrency(obj.valor) : ""}\nValidade: ${obj.validade}`;
      }

      case "listar_hoje": {
        const [hoje, atrasadas] = await Promise.all([
          sbGet("atividades", `data=eq.${today}&status=eq.pendente&select=titulo,tipo,hora,horaFim&order=hora`),
          sbGet("atividades", `data=lt.${today}&status=eq.pendente&select=titulo,tipo,data&order=data&limit=5`),
        ]);
        const tipoEmoji: Record<string,string> = { ligacao:"📞", email:"📧", reuniao:"🤝", followup:"🔄", tarefa:"✅", visita:"🏭" };
        let resp = "";
        if (atrasadas?.length) {
          resp += `⚠️ *ATRASADAS (${atrasadas.length}):*\n`;
          resp += atrasadas.map((a: any) => `• ${tipoEmoji[a.tipo] || "📌"} ${a.titulo} — ${a.data}`).join("\n");
          resp += "\n\n";
        }
        if (hoje?.length) {
          resp += `📅 *HOJE (${hoje.length}):*\n`;
          resp += hoje.map((a: any) => {
            const hora = a.hora ? a.hora + (a.horaFim ? "–" + a.horaFim : "") + " " : "";
            return `• ${tipoEmoji[a.tipo] || "📌"} ${hora}${a.titulo}`;
          }).join("\n");
        }
        return resp || "✅ Nenhuma atividade para hoje!";
      }

      case "listar_pipeline": {
        const rows = await sbGet("leads",
          "status=neq.fechado_ganho&status=neq.fechado_perdido&select=status,valorEstimado");
        if (!rows?.length) return "Pipeline vazio.";
        const labels: Record<string,string> = {
          lead_identificado:"🔵 Lead Identificado", primeiro_contato:"📞 1º Contato",
          qualificacao:"🔍 Qualificação", proposta_elaboracao:"📋 Em Elaboração",
          proposta_enviada:"📤 Proposta Enviada", negociacao:"🤝 Negociação",
        };
        const grouped: Record<string,{count:number, valor:number}> = {};
        let total = 0;
        rows.forEach((l: any) => {
          if (!grouped[l.status]) grouped[l.status] = { count: 0, valor: 0 };
          grouped[l.status].count++;
          grouped[l.status].valor += (l.valorEstimado || 0);
          total += (l.valorEstimado || 0);
        });
        const order = ["lead_identificado","primeiro_contato","qualificacao","proposta_elaboracao","proposta_enviada","negociacao"];
        let r = `📊 *Pipeline — ${rows.length} leads | ${formatCurrency(total)}*\n\n`;
        order.forEach(s => {
          if (grouped[s]) r += `${labels[s]}: ${grouped[s].count} | ${formatCurrency(grouped[s].valor)}\n`;
        });
        return r;
      }

      case "listar_pendencias": {
        const [atrasadas, followups] = await Promise.all([
          sbGet("atividades", `data=lt.${today}&status=eq.pendente&select=titulo,data&limit=8&order=data`),
          sbGet("leads", `dataProximaAcao=lt.${today}&status=neq.fechado_ganho&status=neq.fechado_perdido&select=titulo,dataProximaAcao&limit=5`),
        ]);
        let r = "";
        if (atrasadas?.length) {
          r += `🔴 *Atividades atrasadas (${atrasadas.length}):*\n`;
          r += atrasadas.map((a: any) => `• ${a.titulo} — ${a.data}`).join("\n") + "\n\n";
        }
        if (followups?.length) {
          r += `🟡 *Follow-ups vencidos (${followups.length}):*\n`;
          r += followups.map((l: any) => `• ${l.titulo} — desde ${l.dataProximaAcao}`).join("\n");
        }
        return r || "✅ Tudo em dia! Sem pendências.";
      }

      case "relatorio_rapido": {
        const mesAtual = today.substring(0, 7);
        const [receitas, leadsAtivos, atividadesPend] = await Promise.all([
          sbGet("lancamentos", `tipo=eq.receita&status=eq.recebido&data=gte.${mesAtual}-01&select=valor`),
          sbGet("leads", "status=neq.fechado_ganho&status=neq.fechado_perdido&select=valorEstimado"),
          sbGet("atividades", `status=eq.pendente&select=data`),
        ]);
        const recMes = (receitas || []).reduce((s: number, l: any) => s + (l.valor || 0), 0);
        const pipelineTotal = (leadsAtivos || []).reduce((s: number, l: any) => s + (l.valorEstimado || 0), 0);
        const atrasadas = (atividadesPend || []).filter((a: any) => a.data < today).length;
        return `📈 *Relatório Rápido*\n\n💰 Receita do mês: ${formatCurrency(recMes)}\n🎯 Pipeline ativo: ${formatCurrency(pipelineTotal)} (${leadsAtivos?.length || 0} leads)\n⏰ Atividades atrasadas: ${atrasadas}\n📋 Pendentes total: ${atividadesPend?.length || 0}`;
      }

      default:
        return `Ferramenta "${name}" não reconhecida.`;
    }
  } catch (err: any) {
    console.error(`Erro na ferramenta ${name}:`, err);
    return `Erro ao executar "${name}": ${err.message}`;
  }
}

// ── Claude — loop agêntico ────────────────────────────────────────────────────

async function processarMensagem(texto: string): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const system = `Você é o assistente do CRM da Bikows Soluções em Engenharia.
Recebe mensagens via Telegram e executa ações no sistema CRM.

Hoje é ${hoje}.

PIPELINE (ordem): lead_identificado → primeiro_contato → qualificacao → proposta_elaboracao → proposta_enviada → negociacao → fechado_ganho / fechado_perdido

REGRAS IMPORTANTES:
1. Ao mencionar um cliente/empresa, sempre use "buscar_clientes" primeiro para obter o ID
2. Ao mencionar um lead existente, use "buscar_leads" para obter o ID antes de atualizar
3. Confirme as ações executadas de forma concisa (máx 4 linhas)
4. Use emojis para facilitar a leitura
5. Se a mensagem mencionar múltiplas ações, execute todas em sequência
6. Para datas relativas ("quinta", "semana que vem"), interprete corretamente
7. Responda sempre em português brasileiro`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: texto },
  ];

  // Loop agêntico: executa até Claude devolver end_turn
  for (let i = 0; i < 10; i++) {
    const resp = await client.messages.create({
      model:      "claude-sonnet-4-5",
      max_tokens: 1024,
      system,
      tools:      TOOLS,
      messages,
    });

    if (resp.stop_reason === "end_turn") {
      const txt = resp.content.find((c: any) => c.type === "text");
      return txt ? (txt as any).text : "Pronto!";
    }

    if (resp.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: resp.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type === "tool_use") {
          const out = await executeTool(block.name, block.input as Record<string,any>);
          results.push({ type: "tool_result", tool_use_id: block.id, content: out });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    break;
  }

  return "Ação concluída.";
}

// ── Telegram helpers ──────────────────────────────────────────────────────────

async function tgSend(chatId: number, text: string): Promise<void> {
  await fetch(`${TG}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:    chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

async function tgTyping(chatId: number): Promise<void> {
  await fetch(`${TG}/sendChatAction`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response("ok");
  }

  const msg = update.message || update.edited_message;
  if (!msg?.text) return new Response("ok");

  const chatId  = msg.chat.id as number;
  const text    = msg.text as string;
  const nome    = msg.from?.first_name || "você";

  // Verificar autorização
  if (ALLOWED_IDS.length > 0 && !ALLOWED_IDS.includes(String(chatId))) {
    await tgSend(chatId, "❌ Acesso não autorizado.\n\nEste bot é privado. Fale com o administrador.");
    return new Response("ok");
  }

  // Comandos diretos
  if (text === "/start" || text === "/ajuda" || text === "/help") {
    await tgSend(chatId, `👋 *Bikows CRM Bot*

Olá, ${nome}\\! Envie comandos em linguagem natural:

📝 *Criar registros:*
• "Novo lead Empresa XYZ, NR-12, 35k"
• "Follow-up com Eletran quinta às 14h"
• "Proposta Serra Fita, NR-12, 28k, validade 15 dias"
• "Fechei contrato com ABC Ltda"

📊 *Consultar:*
• /hoje — atividades do dia
• /pipeline — resumo do funil
• /pendencias — itens atrasados
• /relatorio — resumo executivo

💬 *Linguagem natural:*
• "Tive reunião com X, interessados em NR-12, enviar proposta semana que vem"
• "Move lead Serra Fita para negociação, valor 42k"`);
    return new Response("ok");
  }

  if (text === "/hoje")      { await tgTyping(chatId); await tgSend(chatId, await executeTool("listar_hoje", {})); return new Response("ok"); }
  if (text === "/pipeline")  { await tgTyping(chatId); await tgSend(chatId, await executeTool("listar_pipeline", {})); return new Response("ok"); }
  if (text === "/pendencias"){ await tgTyping(chatId); await tgSend(chatId, await executeTool("listar_pendencias", {})); return new Response("ok"); }
  if (text === "/relatorio") { await tgTyping(chatId); await tgSend(chatId, await executeTool("relatorio_rapido", {})); return new Response("ok"); }

  // Processamento via Claude
  await tgTyping(chatId);
  try {
    const resposta = await processarMensagem(text);
    await tgSend(chatId, resposta);
  } catch (err: any) {
    console.error("Erro ao processar:", err);
    await tgSend(chatId, "⚠️ Erro ao processar sua mensagem. Tente novamente.");
  }

  return new Response("ok");
});
