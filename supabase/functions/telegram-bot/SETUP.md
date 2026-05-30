# Bikows CRM — Telegram Bot — Guia de Setup

## PASSO 1 — Criar o bot no Telegram (5 min)

1. Abra o Telegram e procure por **@BotFather**
2. Envie `/newbot`
3. Escolha um nome: `Bikows CRM`
4. Escolha um username: `bikows_crm_bot` (ou qualquer disponível)
5. O BotFather vai te enviar um **TOKEN** — copie e guarde

## PASSO 2 — Descobrir seu Chat ID

1. Inicie uma conversa com o bot que você criou
2. Acesse no navegador:
   ```
   https://api.telegram.org/bot<SEU_TOKEN>/getUpdates
   ```
3. Você vai ver um JSON com `"id": 123456789` — esse é o seu Chat ID

## PASSO 3 — Obter a chave da API Anthropic

1. Acesse https://console.anthropic.com
2. Vá em API Keys → Create Key
3. Copie a chave (começa com `sk-ant-...`)

## PASSO 4 — Configurar variáveis no Supabase

1. Acesse https://supabase.com/dashboard → seu projeto
2. Vá em **Settings → Edge Functions → Secrets**
3. Adicione estas variáveis:

| Nome | Valor |
|------|-------|
| `TELEGRAM_TOKEN` | Token do BotFather |
| `ANTHROPIC_API_KEY` | Chave da Anthropic |
| `ALLOWED_CHAT_IDS` | Seu Chat ID (ex: `123456789`) |

> As variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem automaticamente nas Edge Functions.

## PASSO 5 — Deploy da função

No PowerShell, dentro da pasta do projeto:

```powershell
# Instalar Supabase CLI (se não tiver)
winget install Supabase.CLI

# Login
supabase login

# Deploy
supabase functions deploy telegram-bot --project-ref mxvwccyopzfewhvscrzj
```

## PASSO 6 — Registrar o webhook no Telegram

Rode este comando (substitua os valores):

```powershell
$TOKEN = "SEU_TOKEN_AQUI"
$URL = "https://mxvwccyopzfewhvscrzj.supabase.co/functions/v1/telegram-bot"

Invoke-WebRequest -Uri "https://api.telegram.org/bot$TOKEN/setWebhook?url=$URL" -Method Get
```

Resposta esperada: `{"ok":true,"result":true}`

## PASSO 7 — Testar

Envie `/start` para o bot no Telegram. Ele deve responder com o menu de boas-vindas.

---

## Exemplos de uso

```
/hoje
→ Lista atividades do dia e atrasadas

/pipeline
→ Resumo do funil por estágio com valores

"Novo lead Empresa XPTO, interessada em NR-12, contato com João, valor 35k"
→ Cria lead no pipeline na qualificação

"Follow-up com Eletran na quinta às 14h"
→ Cria atividade de follow-up

"Tive reunião com Serra Fita hoje, muito interessados, preciso elaborar proposta de 42k para NR-12"
→ Cria atividade de elaborar proposta + move lead para Proposta em Elaboração

"Fechei contrato com ABC Ltda"
→ Move lead para Fechado/Ganho

"Proposta NR-35 para DUE Laser, 18k, pagamento 50+50, prazo 10 dias úteis"
→ Cria proposta com todos os campos
```

---

## Manutenção

Para ver logs da função:
```powershell
supabase functions logs telegram-bot --project-ref mxvwccyopzfewhvscrzj
```

Para atualizar após mudanças no código:
```powershell
supabase functions deploy telegram-bot --project-ref mxvwccyopzfewhvscrzj
```
