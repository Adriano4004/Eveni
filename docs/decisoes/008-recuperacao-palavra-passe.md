# 008 — Recuperação e mudança de palavra-passe

**Data:** 19/10/2026 · **Estado:** Em vigor (Fase 1, terceiro PR)

| Tema | Decisão | Porquê |
|---|---|---|
| Pedir a recuperação | Resposta sempre igual, exista ou não a conta; o trabalho (procurar a conta, criar a ligação, enviar) corre depois da resposta | Nem o conteúdo nem o tempo de resposta revelam que e-mails estão registados |
| Limites | 10 pedidos/hora por IP; por endereço, 3 e-mails/hora a partir do mesmo IP e 10/hora no total (acima disso responde igual, não envia e regista na auditoria) | O Eveni não serve para encher a caixa de ninguém, e quem esgota os pedidos de outra pessoa num sítio não a impede de recuperar noutro |
| Ligação | Uso único, válida **1 hora**, só o hash na base de dados; um pedido novo invalida o anterior; ligações de confirmação não servem para isto | Quem tem acesso ao e-mail durante a validade controla a conta: prazo curto (`CLAUDE.md`, secção 5, regra 3) |
| Ao definir a nova | Termina **todas** as sessões; não inicia sessão sozinho (a pessoa entra a seguir) | `CLAUDE.md`, secção 5, regra 1. Entrar a seguir garante que o 2FA (próximo PR) não é contornado |
| E-mail confirmado | Definir a palavra-passe pela ligação confirma também o e-mail | A ligação chegou ao e-mail. Devolve ao verdadeiro dono um e-mail que outra pessoa tenha registado sem confirmar |
| Bloqueios de entrada | Ao definir a nova palavra-passe, limpa-se só o bloqueio do IP de onde o dono a definiu | O dono entra logo a seguir; quem tentava adivinhar noutro IP não recomeça com o limite cheio |
| Recarregar a página da ligação | O token fica guardado no separador do browser (não no endereço) | Puxar para baixo no Android não perde a ligação |
| Mudar com sessão iniciada | Pede a palavra-passe actual; termina as outras sessões e mantém esta (com um token novo); no máximo 10 tentativas/hora | Quem encontra um telemóvel com a sessão aberta não consegue mudar a palavra-passe nem adivinhar a actual |
| Aviso | Sempre que a palavra-passe muda, segue um e-mail "A sua palavra-passe foi alterada" com ligação para recuperar a conta | Se não foi o dono, fica a saber e pode reagir |
