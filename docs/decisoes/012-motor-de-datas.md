# 012 — Motor de datas e regra de compressão

**Data:** 20/10/2026 · **Estado:** Em vigor (Fase 2, segundo PR)

## O que faz

Ao criar um projecto, cada tarefa do template passa de um offset (`D-21`, `D0`, `D+7`) para datas reais: **data do evento + offset**. O código está em `src/shared/materializacao.ts` e `src/shared/datas.ts`. São funções puras, sem base de dados, para se poderem testar dia a dia.

## Datas

- As tarefas são de **dia inteiro**: guardam-se como datas de calendário (`aaaa-mm-dd`, tipo `date` na base de dados), não como instantes. Assim, uma tarefa de 05/11 não muda de dia por causa de fusos horários.
- O "hoje" é sempre o dia de calendário **em Luanda** (UTC+1, sem hora de Verão). Às 23:30 em UTC já é o dia seguinte em Luanda.
- Os instantes (criação, sessões, registos) continuam guardados em UTC, como até aqui.
- Apresentação: `dd/mm/aaaa`.

## Regra de compressão

- **Antecedência necessária** = o offset mais antigo do template (21 dias no T01, 365 no T02).
- Se faltam **pelo menos** esses dias até ao evento, não se comprime nada. Exactamente 21 dias no T01 conta como suficiente: a primeira tarefa fica para hoje.
- Se faltam **menos**, as tarefas **não críticas** anteriores ao evento são comprimidas na proporção *dias disponíveis ÷ antecedência necessária*. Exemplo: com 10 dias para um template de 20, uma tarefa de D-10 passa a D-5. O arredondamento é feito sempre para o lado do evento, para nenhuma tarefa ficar antes de hoje. A ordem entre elas mantém-se.
- As tarefas **críticas nunca se comprimem**: mantêm o offset, mesmo que a data já tenha passado. Cada uma dessas tarefas gera um **aviso** com o título, a data em que deveria ter começado e os dias em falta. Os avisos são mostrados **no momento de criar o projecto**, no próximo PR.
- As tarefas no dia do evento ou depois dele (`D0`, `D+7`) nunca mudam.
- Um evento com data no passado é recusado. Um evento **hoje** é aceite: as tarefas não críticas passam todas para hoje e as críticas anteriores aparecem nos avisos.

## Limitações conhecidas

- Não há dependências entre tarefas. Depois de comprimir, uma tarefa não crítica pode ficar antes de uma crítica de que, na prática, depende. Se isto se revelar um problema num evento real, tratar numa fase posterior.
