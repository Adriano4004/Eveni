# 005 — Domínio e e-mail

**Data:** 19/10/2026 · **Estado:** Pendente — o Adriano terá o domínio nos próximos dias

- A Resend exige um domínio próprio verificado; `*.up.railway.app` não serve.
- Até lá, em `staging`, os e-mails não são enviados: ficam escritos nos logs. A aplicação mostra isto claramente nos logs no arranque.
- Em `production`, a aplicação **recusa arrancar** sem `RESEND_API_KEY` e `EMAIL_FROM`.

## Quando houver domínio

O Adriano indica o domínio; o Claude Code prepara a lista exacta de registos DNS a criar e onde configurar `APP_URL`, `RESEND_API_KEY` e `EMAIL_FROM`.
