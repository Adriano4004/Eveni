# 022 — Fórum e Conferência, derivados do T03

**Data:** 21/10/2026 · **Estado:** Em vigor (Fase 8, segundo PR; aprovado pelo Adriano a 21/10/2026)

## O que são

| Código | Nome | O que é | Horizonte | Tarefas | Críticas | Rubricas |
|---|---|---|---|---|---|---|
| T05 | Fórum | Debate de um dia, com painéis e entrada por convite (sem inscrições pagas); pode ter patrocínio | 3 meses | 62 | 30 | 13 + contingência 10% |
| T06 | Conferência | Um dia de palestras, com inscrições abertas (pagas ou gratuitas); pode ter um orador estrangeiro | 4 meses | 70 | 35 | 15 + contingência 10% |

- **Fórum, tarefas que saem do T03 (12):** comissão científica, ponto de equilíbrio, chamada de trabalhos, prazo de submissão, avaliação das submissões, escalões de inscrição, pagamento das inscrições, vistos de oradores estrangeiros, alojamento dos oradores, tradução simultânea, preparar certificados, enviar certificados. Rubricas que saem: tradução simultânea, viagens de oradores, alojamento de oradores.
- **Conferência, tarefas que saem do T03 (4):** comissão científica, chamada de trabalhos, prazo de submissão, avaliação das submissões. Ficam todas as rubricas.
- **Nome:** fica "Conferência". O ecrã de criar projecto passa a mostrar a descrição de cada tipo, e a da Conferência diz que não é para a imprensa.

## Como são feitos

- **Não são escritos à mão.** O ficheiro `scripts/templates-derivados.ts` diz só o que muda em relação ao T03. A conversão do Excel (`npm run templates:converter`) gera `data/templates/T05.json` e `T06.json` a partir do T03.
- **Herdam do T03** os títulos, as notas, as fases, as categorias, os papéis, as críticas e as rubricas. Mudar uma nota do T03 no Excel muda-a também no Fórum e na Conferência. Uma tarefa nova no T03 entra nos dois; para a deixar de fora, acrescenta-se à lista `saem`.
- **Textos:** "congresso" passa a "evento" na tarefa do site e na rubrica do site.
- **IDs:** cada tarefa guarda o número da tarefa de origem (T03-018 → T05-018). Os números das tarefas que saem ficam por usar, para nenhum ID mudar de significado.
- **Prazos:**
  - o último mês antes do evento e o que vem depois ficam iguais aos do T03 (gerador, crachás, ensaio, relatórios);
  - o planeamento anterior a D-30 encolhe na mesma proporção, para o primeiro dia do T03 (D-180) passar a ser o primeiro dia do derivado (D-90 no Fórum, D-120 na Conferência);
  - excepção: na Conferência, os vistos continuam de D-90 a D-45, porque a nota do T03 pede 90 dias.
- **Erros param a conversão:** uma tarefa ou rubrica da lista que já não exista no T03, um horizonte fora do intervalo ou um código repetido.

## Lançamento

- Disponíveis para todos, em todos os planos, logo. Derivam do T03, que já correu num evento real (decisão 021).
- Os projectos guardam a versão do template, como os outros: alterar o T03 depois não muda projectos já criados.
