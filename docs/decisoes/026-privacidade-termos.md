# 026 — Política de privacidade e termos de utilização

**Data:** 23/10/2026 · **Estado:** Em vigor (rascunho do texto à espera de revisão por um jurista)

Cumpre o `CLAUDE.md`, secção 6: a política de privacidade e os termos têm de estar acessíveis na aplicação (Lei n.º 22/11).

## Decisões do Adriano (23/10/2026)

- **Responsável pelos dados:** BLUE BERN Comércio Geral e Prestação de Serviços, Lda., NIF 5000143723, Rua Marechal Brós Tito, n.º 35, Edifício Skyone, 4.º andar, Kinaxixi, Luanda.
- **Contacto para pedidos sobre dados pessoais:** `privacidade@eveni.ao`.
- **Termos novos:** na entrada seguinte, a pessoa tem de aceitar a nova versão antes de continuar.
- **Idade mínima:** 18 anos.

## Como funciona

- **Páginas públicas:** `/privacidade` e `/termos` abrem-se sem sessão. Têm ligações no ecrã de entrada, no registo, no início e na página de RSVP dos convidados. Os textos estão em `mensagens.legal` (`src/shared/mensagens.ts`).
- **Registo:** a caixa "Tenho 18 anos ou mais e aceito os termos… e a política…" é obrigatória. O servidor recusa o registo sem ela. As ligações da caixa abrem noutro separador, para não se perder o que já foi escrito.
- **Prova da aceitação:**
  - cada conta guarda a versão aceite e quando (`users.terms_version`, `users.terms_accepted_at`). A base de dados não aceita uma sem a outra;
  - o registo na auditoria leva a versão, e cada nova aceitação fica como `conta.termos_aceites`;
  - a exportação dos dados da conta inclui a versão e a data.
- **Versão:** `VERSAO_TERMOS` em `src/shared/legal.ts`, com a data da versão (hoje `2026-10-23`). Para pedir a todos que aceitem de novo, muda-se esta data.
- **Contas sem a versão actual** (as criadas antes desta alteração, ou quando a versão mudar):
  - a aplicação mostra só o ecrã "Termos actualizados";
  - o servidor recusa tudo o resto com 403;
  - funcionam apenas: ver a conta, aceitar, sair, e exportar ou eliminar os dados. A lei garante estes dois direitos, aceite-se ou não a nova versão;
  - só se aceita a versão que está em vigor: um pedido com outra versão é recusado.

## Plano Singular (ponto em aberto da decisão 003)

O limite de 1 projecto é **para sempre** (decidido pelo Adriano a 23/10/2026). Está também nos termos.

## Fora do código (para o Adriano)

- **Revisão por um jurista** antes de ir para produção, em especial:
  - o fundamento legal do tratamento;
  - a transferência dos dados para fora de Angola (Railway e Resend);
  - a cláusula de responsabilidade;
  - o foro.
- **Notificação prévia à APD**, que continua por fazer (ver decisão 010).
- **Criar a caixa de correio `privacidade@eveni.ao`**, ou um reencaminhamento para o teu e-mail, no fornecedor do domínio.
- Se o jurista mudar o texto, o Claude Code actualiza-o. Se a mudança for de fundo, muda-se também a data da versão, para todos aceitarem de novo.
