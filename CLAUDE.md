# CLAUDE.md — Eveni (reconstrução de raiz)

Contexto permanente para o Claude Code. Ler na íntegra antes de qualquer tarefa.

> **Facto principal:** o Eveni vai ser **reconstruído do zero**, num repositório novo. A versão anterior (Node/Express, JavaScript puro, MySQL, Railway — "v1.2") **não é ponto de partida de código**. Serve apenas como fonte de conhecimento: regras de negócio, conteúdo dos templates e lições de segurança, todas descritas neste ficheiro. Não copiar código antigo.

---

## 1. O produto

SaaS de gestão de eventos para o mercado angolano. Serve três tipos de cliente através de **templates de projecto diferenciados**, não de um fluxo genérico:

- **Instituições e agências** — conferências de imprensa, congressos, lançamentos
- **Pessoas singulares e wedding planners** — casamentos (inclui alembamento e lobolo)
- **Organizadores culturais** — festivais e concertos

**A vantagem competitiva não é o software de tarefas** — esse existe em qualquer lado. É o **conhecimento operacional angolano** codificado nas notas de cada tarefa: o follow-up telefónico que enche a sala (o e-mail não chega), o gerador de emergência, o Multicaixa Express, a conservatória do registo civil, o lobolo como rubrica de orçamento. Esse conteúdo é produto, não texto de ajuda.

O produto **Laço Perfeito** (SaaS de casamentos) será descontinuado e absorvido pelo Eveni como template de casamento.

Responsável: Adriano Sousa (Luanda). **Não é programador.** Trabalha num Chromebook, sem ambiente local, pela interface web do GitHub e do Railway. Todas as explicações dirigidas a ele devem ser claras, sem jargão desnecessário, e dizer exactamente o que ele tem de fazer à mão.

---

## 2. Língua e convenções de texto

- **Toda a interface, mensagens de erro, e-mails, PDF e documentação em português europeu, ortografia pré-Acordo de 1990**: projecto, actual, acção, direcção, óptimo, facto, recepção, objectivo.
- Nunca português do Brasil: **equipa** (não "equipe"), **utilizador** (não "usuário"), **palavra-passe** (não "senha"), **ecrã** (não "tela"), **registo** (não "registro"), **contacto** (não "contato"), **telemóvel** (não "celular").
- Moeda: **Kwanza (Kz)** em toda a aplicação. Formato pt-PT: espaço como separador de milhares, vírgula decimal, duas casas — `5 000 000,00 Kz`. Guardar valores monetários como inteiros (cêntimos) ou `NUMERIC`, nunca `float`.
- Datas: `dd/mm/aaaa`. Fuso horário: `Africa/Luanda` (UTC+1). Guardar em UTC, apresentar em hora de Luanda.
- Todos os textos da interface centralizados num único ficheiro de mensagens, mesmo que só exista pt-PT, para revisão fácil.
- Comentários de código e mensagens de commit podem ser em português.

---

## 3. Restrições de infra-estrutura (fixas)

- **Alojamento: Railway**, deploy automático a partir do GitHub.
- **Código: GitHub.** O Adriano revê e faz merge pela interface web.
- **E-mail transaccional: Resend**, via API HTTPS (o SMTP não está disponível nos planos não-Pro do Railway). Exige domínio próprio verificado; `*.up.railway.app` não serve.
- **Sem acesso à produção a partir do Claude Code.** Nunca pedir nem usar credenciais da base de dados de produção. Testar sempre com uma base de dados criada dentro da sessão.

---

## 4. Stack — recomendação por omissão (confirmar na Fase 0)

A stack é uma decisão da Fase 0. Propor ao Adriano, justificar em linguagem simples e registar em `docs/decisoes/`. Recomendação de partida, que pode ser contestada com argumentos:

| Camada | Recomendação | Porquê |
|---|---|---|
| Linguagem | **TypeScript** em todo o lado | Apanha erros antes do deploy; o código vai ser mantido quase só pelo Claude Code |
| Backend | Node.js 22 LTS + framework HTTP com validação de esquemas (ex.: Fastify) | Validação de todas as entradas por omissão |
| Validação | Esquemas partilhados entre frontend e backend (ex.: zod) | Uma só fonte de verdade para formulários e API |
| Base de dados | **PostgreSQL** (serviço do Railway) | Restrições, transacções e tipos mais sólidos do que a MySQL anterior |
| Migrações | **Ficheiros de migração versionados** (ex.: Drizzle ou Kysely) | Substitui o antigo `migrate()` que corria a cada arranque |
| Frontend | Aplicação web leve servida pelo mesmo serviço; **mobile-first** | Um só serviço no Railway, menos peças para o Adriano gerir |
| Testes | Testes unitários + integração com BD real + testes ponta-a-ponta no browser (ex.: Vitest + Playwright) | O Adriano não testa à mão; os testes são a garantia |
| PDF | Geração no servidor | Relatórios para clientes de agências |

Princípios que **não** são opcionais, seja qual for a stack escolhida: um só serviço de aplicação + um de base de dados no Railway; dependências mínimas e mantidas; `package-lock.json` (ou equivalente) commitado.

---

## 5. Arquitectura de segurança — desde o primeiro dia

A versão anterior foi auditada. Estas regras resultam directamente dos problemas encontrados e têm de estar no desenho, não em correcções posteriores.

1. **Sessões revogáveis.** Sessões guardadas no servidor (ou JWT com versão por utilizador verificada a cada pedido). Mudar ou redefinir a palavra-passe **termina todas as sessões**. Existe "terminar sessão em todos os dispositivos". *(Falha anterior: JWT de 30 dias sem revogação.)*
2. **Confirmação de e-mail obrigatória** antes de criar projectos ou gerar links públicos. Quem não confirmou entra e vê a aplicação, mas não cria nada.
3. **Recuperação de palavra-passe** com token de uso único, prazo curto, guardado em hash.
4. **2FA (TOTP)** opcional para todos, com códigos de recuperação.
5. **Autorização no servidor, sempre.** Toda a rota que recebe um ID verifica que o utilizador tem acesso a esse recurso **através do projecto/espaço a que pertence** — incluindo IDs secundários dentro do corpo do pedido (fornecedor num item de orçamento, convidado num RSVP). *(Falha anterior: IDOR no fornecedor do orçamento.)*
6. **RSVP com token por convidado**, não por projecto. O link confirma a presença daquele convidado; não cria linhas novas. Limitação de pedidos específica para endpoints públicos. Unicidade de convidado por projecto. *(Falha anterior: RSVP público criava estranhos e duplicados.)*
7. **Consultas parametrizadas** sempre; nunca SQL concatenado.
8. **Escape de todo o conteúdo do utilizador** no frontend (nomes vindos do RSVP público incluídos).
9. **Limitação de pedidos** em autenticação, recuperação, 2FA e endpoints públicos, guardada de forma que funcione com mais de uma instância.
10. **Nunca expor segredos** em respostas da API (`totp_secret`, hashes, tokens).
11. **Cabeçalhos de segurança** (CSP, HSTS, cookies `HttpOnly`, `Secure`, `SameSite`), CSRF tratado.
12. **Envio de e-mail nunca bloqueia o fluxo**, mas falhas ficam **sempre registadas** com código de erro nos logs. *(Falha anterior: e-mail falhava em silêncio quando o `APP_URL` faltava.)*
13. **Validação de configuração no arranque.** Se faltar uma variável obrigatória (`APP_URL`, segredos), a aplicação recusa arrancar com mensagem clara, em vez de correr partida.
14. **Logs de auditoria** para acções sensíveis (login, mudança de palavra-passe, alteração de membros, exportação, eliminação).

---

## 6. Protecção de dados (Lei n.º 22/11, Angola)

- **Exportação completa** dos dados do utilizador: conta, projectos, tarefas, convidados, fornecedores, orçamento — tudo. *(Falha anterior: exportação parcial.)*
- **Eliminação completa** da conta e de todos os dados associados. *(Falha anterior: eliminação incompleta.)*
- Política de privacidade e termos acessíveis na aplicação.
- Dados de convidados são dados de terceiros: recolher só o necessário.
- Assuntos jurídicos **fora do código**, a assinalar ao Adriano, não a resolver: alojamento fora de Angola (Railway) exige fundamento legal; notificação prévia à APD.

---

## 7. Modelo de domínio

Proposta de partida — refinar na Fase 0:

- **Utilizador** — conta individual.
- **Espaço de trabalho** (organização) — é o espaço que tem o plano, os membros e os projectos. Um utilizador singular tem um espaço só seu; uma agência tem um espaço com vários membros. *(Novo: na versão anterior os projectos pertenciam ao utilizador e a colaboração foi acrescentada depois.)*
- **Membro** — utilizador num espaço, com papel.
- **Projecto (evento)** — pertence a um espaço; tem template, data do evento, local, audiência, orçamento previsto, estado (activo / arquivado).
- **Membro do projecto** — papéis `owner` / `editor` / `viewer`.
- **Tarefa** — materializada a partir do template; datas reais, responsável (utilizador real, não texto livre), estado, crítica, nota.
- **Convidado** — com token próprio de RSVP, estado de resposta, contacto, mesa/lugar.
- **Fornecedor** — por espaço, reutilizável entre projectos, com avaliação.
- **Item de orçamento** — categoria, descrição, previsto, real, fornecedor opcional.
- **Template**, **tarefa de template**, **rubrica de orçamento de template** — dados de referência versionados.

Usar nomes consistentes em inglês no código (`suppliers`, não misturar com `vendors`) e pt-PT na interface.

---

## 8. Regras de negócio

### Planos e quotas
- Planos conhecidos: **Singular**, **Empresarial** (colaboração até 10 membros), **Grandes** (membros ilimitados). Preços e limites exactos de projectos: **perguntar ao Adriano**.
- Colaboração só em Empresarial e Grandes.
- A contagem de projectos é **cumulativa desde o início do período do plano**.
- Não existe eliminação de projectos pelo utilizador: só **arquivar** e **restaurar**. Arquivados **continuam a contar** para o limite.
- "Eventos extra" avulsos dependem de pagamentos — fase posterior.

### Orçamento
- Totais previsto / real / variação, por categoria e globais.
- Contingência: 10% por omissão, 15% no casamento.
- Alerta quando o real ultrapassa o previsto.

---

## 9. Sistema de templates — o coração do produto

Fonte: `docs/templates/Eveni-Templates-Projecto.xlsx` (o Adriano vai acrescentá-lo ao repositório). **Primeira tarefa desta área: converter o Excel em ficheiros de dados versionados** (ex.: `data/templates/T01.json`) com um script de conversão e **testes que validam o resultado**: T01 = 47 tarefas, 20 críticas; T02 = 69 tarefas, 28 críticas; T03 = 74 tarefas, 35 críticas; IDs únicos; offsets válidos; categorias e papéis dentro das listas fechadas.

### Arquitectura
- As tarefas do template **não têm datas, têm offsets** relativos ao dia do evento: `D-90`, `D0`, `D+7`.
- Ao criar o projecto com a data do evento, o sistema **materializa** as datas reais.
- Cada tarefa: `ID` estável (ex. `T01-022`, nunca reutilizado), `Fase`, `Categoria`, `Título` (verbo no infinitivo), `Papel`, `Início`, `Fim` (vazio = um dia), `Crítica` (Sim/Não), `Nota`.
- Os templates são versionados: alterar um template não altera projectos já criados.

### Regra de compressão
- Se a data do evento estiver mais próxima do que o offset mais antigo, **comprimir proporcionalmente**.
- **Nunca comprimir tarefas críticas.** Mantêm o offset, e o sistema **avisa no momento de criar o projecto** que o prazo é insuficiente, listando as tarefas afectadas (ex.: casamento a 60 dias não permite convites a D-90). O aviso aparece na criação, não a D-30.
- Esta regra exige **testes exaustivos** com datas-limite (evento hoje, amanhã, exactamente no offset máximo, depois dele).

### A coluna Nota
É a coluna mais importante. Mostrar com destaque ao abrir a tarefa, não escondida num tooltip.

### Taxonomia (listas fechadas)
- **Fases:** Pré Produção · Produção · Pós Produção
- **Categorias de tarefa:** Estratégia · Local e Logística · Fornecedores · Comunicação · Convidados · Protocolo · Técnica · Financeiro · Legal · Equipa · Registo · Alojamento · Artístico · Produção · Segurança · Transporte
- **Papéis:** Gestor · Produção · Comunicação · Financeiro · Protocolo · Técnica · Cliente · Registo · Legal · Segurança
- **Categorias de orçamento:** Local · Divulgação · Decoração/Iluminação · Equipamentos · Alimentação/Hospedagem · Equipa de trabalho · Artístico · Segurança · Transporte · Legal · Outros

(Valores acrescentados à folha Taxonomia do Excel por decisão do Adriano: ver `docs/decisoes/011-templates.md`.)

### Templates
| Código | Tipo | Tarefas | Críticas | Horizonte | Comprador |
|---|---|---|---|---|---|
| T01 | Conferência de Imprensa | 47 | 20 | 21 dias | Instituição, agência |
| T02 | Casamento | 69 | 28 | 12 meses | Pessoa singular, wedding planner |
| T03 | Congresso | 74 | 35 | 6 meses | Instituição, associação, empresa |
| T04 | Festival/Concerto | 86 | 49 | 8 meses | Produtor cultural, promotor, agência |

Cada template traz **rubricas de orçamento pré-carregadas com valor zero** (algumas obrigatórias).

**Ordem de lançamento:** T01 → T03 → T04 → T02 (decidida pelo Adriano a 20/10/2026). Fórum e Conferência derivam do T03; Aniversário é uma versão reduzida do T02.

**Regra:** um template só passa a produção depois de ter corrido num evento real, de ponta a ponta, com um organizador que não seja o Adriano. *(T01: cumprida, confirmado a 20/10/2026.)*

---

## 10. Plano de construção por fases

Cada fase termina com: testes a passar, PR revisto, deploy em staging verificado. Não avançar de fase sem o Adriano aprovar.

**Fase 0 — Planeamento (sem código de produto)**
- Confirmar stack, modelo de domínio e plano de fases; registar em `docs/decisoes/` (um ficheiro curto por decisão).
- Fazer ao Adriano as perguntas da secção 12.
- Montar o esqueleto: repositório, CI no GitHub Actions (testes + verificação de tipos + análise de dependências a cada PR), serviços `staging` e `production` no Railway, validação de configuração no arranque, endpoint `/health`.

**Fase 1 — Contas e segurança**
Registo, confirmação de e-mail via Resend, login, sessões revogáveis, recuperação de palavra-passe, 2FA, espaço de trabalho pessoal criado no registo, exportação e eliminação de conta.

**Fase 2 — Motor de templates + T01**
Conversão do Excel, materialização com offsets, regra de compressão com avisos, criação de projecto a partir do T01.

**Fase 3 — Gestão do projecto**
Tarefas (lista, calendário, filtros por fase/categoria/papel/estado), responsáveis reais, notas em destaque, progresso por categoria, alertas de tarefas críticas em atraso, arquivo/restauro, quotas por plano.

**Fase 4 — Colaboração**
Membros do espaço, convites, papéis por projecto, registo de auditoria.

**Fase 5 — Convidados e RSVP**
Lista de convidados, importação, token por convidado, página pública de RSVP mobile-first, partilha por WhatsApp (link), confirmações, mesas/lugares.

**Fase 6 — Fornecedores e orçamento**
Fornecedores por espaço, avaliação pós-evento, orçamento com rubricas do template, previsto vs real, alertas de estouro.

**Fase 7 — Relatórios**
PDF do projecto com orçamento; modelos "para cliente", "interno", "cronograma"; white-label para agências (logo, cor, rodapé).

**Fase 8 — T03, depois T04, depois T02** (o T02 após decisão sobre o Laço Perfeito).

**Mais tarde:** notificações WhatsApp (Twilio ou Meta Cloud API), pagamentos (Multicaixa Express/EMIS prioritário; cartões internacionais em segundo plano), landing page pública, eventos extra.

---

## 11. Forma de trabalhar

### Fluxo
1. O Adriano pede a tarefa no Claude Code (web).
2. O Claude Code planeia, escreve testes, implementa, corre tudo na sessão e abre um **pull request**.
3. O Adriano revê e faz merge para `staging`; valida no URL de staging; promove para `main` (produção).

### Cada pull request deve incluir
- Descrição em português simples: o que muda e porquê.
- **"O que tens de fazer à mão"** — variáveis no Railway, configurações, nada se não houver nada.
- Como verificar no staging, em passos clicáveis.
- Testes novos para o que mudou. Em autenticação, permissões ou endpoints públicos: **testes que tentam o acesso indevido e confirmam que falha**.
- Revisão com o plugin de code-review antes de pedir merge.

### Regras
- PRs pequenos, um bloco funcional de cada vez.
- Migrações sempre versionadas e reversíveis; nunca alterar dados em produção sem migração revista.
- Antes de acrescentar uma dependência, justificar.
- Perante ambiguidade de produto, **perguntar** em vez de assumir.
- Testar com base de dados criada dentro da sessão (instalar PostgreSQL na sessão, ou equivalente embebido para testes).

---

## 12. Decisões em aberto — perguntar na Fase 0

1. **Stack**: aprovar ou ajustar a recomendação da secção 4.
2. **Dados da versão anterior**: há utilizadores em teste com projectos reais? Migrar para a nova versão ou começar vazio? A versão antiga mantém-se no ar até a nova a substituir?
3. **Domínio** do Eveni (necessário para a Resend).
4. **Planos**: preços e limites de projectos por plano.
5. **Template T04**: ~~localizar o ficheiro~~ — resolvido: está no Excel (ver `docs/decisoes/011-templates.md`).
6. **Laço Perfeito**: fronteira com o T02 e eventual migração de clientes.
7. **Identidade visual**: logo, cores, tipografia existentes ou a criar.
8. **Fornecedor de WhatsApp** e **gateway de pagamentos** (só para fases posteriores).

---

## 13. Notas de produto que vêm da experiência

- Em Angola, o **WhatsApp** tem melhor taxa de leitura do que o e-mail. Links de RSVP partilham-se por WhatsApp.
- Plano gratuito da Resend: 100 e-mails/dia, 3000/mês. Chega para contas e recuperações; **não chega para convites em massa**. Separar os dois fluxos quando os convites passarem a sair da plataforma.
- Pagamentos com cartão internacional excluem a maioria do público angolano: Multicaixa Express e referência primeiro.
- A interface tem de funcionar bem em telemóveis Android de gama média e em redes lentas.
