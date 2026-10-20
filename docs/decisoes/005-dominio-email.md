# 005 — Domínio e e-mail

**Data:** 19/10/2026; actualizada a 20/10/2026 · **Estado:** Aprovada (falta configurar a Resend e o Railway)

## Decisões do Adriano (20/10/2026)

- **Domínio:** `eveni.ao`.
- **Aplicação:** `https://app.eveni.ao` (produção) e `https://staging.eveni.ao` (testes). O endereço `eveni.ao` fica livre para a página de apresentação pública, prevista para mais tarde.
- **Remetente dos e-mails:** `Eveni <nao-responder@eveni.ao>`.

## Regras que se mantêm

- A Resend exige um domínio próprio verificado; `*.up.railway.app` não serve.
- Sem Resend configurada, os e-mails não são enviados: ficam escritos nos logs (`[email:simulado]`).
- Em `production`, a aplicação **recusa arrancar** sem `RESEND_API_KEY` e `EMAIL_FROM`.

## Configuração (o que o Adriano faz à mão)

### 1. Resend: verificar o domínio (pode ser feito já)

1. Criar conta em resend.com e escolher **Domains → Add Domain**. Escrever `eveni.ao` e escolher a região mais próxima (Europa).
2. A Resend mostra uma lista de registos DNS (normalmente um registo `MX` e um `TXT` para `send.eveni.ao`, e um `TXT` para `resend._domainkey.eveni.ao`). Copiar cada um, exactamente como aparece, para o painel de DNS onde o domínio `eveni.ao` foi registado.
3. Voltar à Resend e carregar em **Verify**. A verificação pode demorar de minutos a algumas horas.
4. Em **API Keys → Create API Key**, criar uma chave com permissão "Sending access" para o domínio `eveni.ao`. **A chave só aparece uma vez:** guardá-la num sítio seguro até a pôr no Railway. Nunca a enviar por chat nem a colar no GitHub.

### 2. Railway: quando a conta voltar a estar activa

Em cada serviço (staging e produção), em **Variables**:

| Variável | Staging | Produção |
|---|---|---|
| `APP_URL` | `https://staging.eveni.ao` | `https://app.eveni.ao` |
| `RESEND_API_KEY` | a chave criada no passo 1.4 | a mesma chave (ou uma segunda, só para produção) |
| `EMAIL_FROM` | `Eveni <nao-responder@eveni.ao>` | `Eveni <nao-responder@eveni.ao>` |

E, em **Settings → Networking → Custom Domain**, acrescentar `staging.eveni.ao` (staging) e `app.eveni.ao` (produção). O Railway mostra um registo `CNAME` para cada um, a criar no mesmo painel de DNS.

## Limites a ter presentes

Plano gratuito da Resend: 100 e-mails por dia, 3 000 por mês. Chega para contas, recuperações e convites para a equipa; **não chega para convites em massa a convidados de eventos** (Fase 5), que terão de seguir por outro caminho (WhatsApp ou plano pago).
