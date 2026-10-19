# 006 — Contas e sessões

**Data:** 19/10/2026 · **Estado:** Em vigor (Fase 1, primeiro PR)

Escolhas técnicas da primeira parte da Fase 1. Seguem as regras de segurança do `CLAUDE.md`, secção 5.

| Tema | Decisão | Porquê |
|---|---|---|
| Palavras-passe | Argon2id (`@node-rs/argon2`, parâmetros da OWASP) | Algoritmo recomendado actualmente; resiste a ataques com placas gráficas |
| Regras da palavra-passe | 10 a 200 caracteres, letras e números, fora da lista de palavras-passe comuns | Mesmas regras da versão anterior; o máximo evita sobrecarregar o servidor |
| Sessões | Guardadas na base de dados; o cookie leva um token aleatório e a base guarda só o hash | Terminar sessão tem efeito imediato; uma fuga da base de dados não dá acesso às contas |
| Duração | 30 dias, renovados enquanto a conta for usada | Equilíbrio entre comodidade no telemóvel e segurança |
| Cookie | `HttpOnly`, `SameSite=Lax`; fora do ambiente local também `Secure` e prefixo `__Host-` | O JavaScript da página não lê o cookie, e o browser só o envia por https |
| Pedidos forjados (CSRF) | Pedidos que alteram dados só são aceites com cabeçalho `Origin` igual ao endereço do Eveni | Recomendação da OWASP; mais simples do que tokens CSRF e igualmente eficaz |
| Limitação de tentativas | Guardada na base de dados. Por IP: 30 registos/hora e 100 entradas/15 min. Por conta: 10 tentativas/hora a partir do mesmo IP e 50 tentativas/hora no total | Os limites por IP são largos porque muitos clientes das operadoras móveis angolanas partilham o mesmo IP. Um atacante num IP não consegue bloquear o dono da conta noutro IP, e um ataque distribuído pára às 50 tentativas |
| IP do cliente | Confia-se só nos proxies do alojamento (`TRUST_PROXY_HOPS`, 1 no Railway) | Sem isto, o IP podia ser falsificado e os limites contornados |
| Limpeza | De hora a hora apagam-se as sessões expiradas e os contadores com mais de um dia | As tabelas não crescem sem fim |
| Mensagens de entrada | "E-mail ou palavra-passe incorrectos" em ambos os casos, com o mesmo tempo de resposta | Não revela que e-mails têm conta |
| Registo com e-mail existente | Diz que o e-mail já tem conta. Ver decisão 007 | Esconder isto obrigaria a confirmar o e-mail antes de entrar, o que contraria a regra "quem não confirmou entra e vê a aplicação" |
| Espaço de trabalho | Criado no registo, com o nome "Espaço de {nome}", no plano Singular, com a pessoa como `owner` | Modelo de domínio do `CLAUDE.md`, secção 7 |
| Auditoria | Registo, entradas, falhas, bloqueios e saídas ficam em `audit_log`. Ao eliminar a conta, o registo fica sem ligação à pessoa | Exigido pela secção 5, regra 14 |
| Acesso à base de dados | SQL parametrizado escrito à mão; o Drizzle só gere o esquema e as migrações | Consultas explícitas e fáceis de rever |
| Migrações | Cada migração em `drizzle/` tem um ficheiro de reversão em `drizzle/reverter/`, para uso manual depois de revisto | O `CLAUDE.md` exige migrações reversíveis; o Drizzle não as gera |
