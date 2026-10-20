# 011 — Dados dos templates

**Data:** 20/10/2026 · **Estado:** Em vigor (Fase 2, primeiro PR)

## Fonte e conversão

- **Fonte única:** `docs/templates/Eveni-Templates-Projecto.xlsx`. Os textos das tarefas, as notas e as rubricas mudam-se **no Excel**, nunca nos ficheiros de dados.
- **Conversão:** `npm run templates:converter` gera `data/templates/taxonomia.json` e um ficheiro por template (`T01.json`…`T04.json`). Um teste volta a converter o Excel e falha se os ficheiros não estiverem actualizados.
- **Versão:** cada template tem um identificador do conteúdo (`versao`, um hash). Muda sempre que o template muda. Os projectos vão guardar a versão com que foram criados: alterar um template não altera projectos existentes.
- **Datas:** os offsets do Excel (`D-21`, `D0`, `D+7`) passam a números de dias (`-21`, `0`, `7`). `Fim` vazio passa a ser igual ao `Início` (tarefa de um dia).
- As linhas de totais no fim de cada folha não são tarefas: o conversor ignora linhas sem ID. Na versão anterior, eram lidas como tarefas.
- **O conversor recusa erros em vez de os passar para o produto:** "Crítica" e "Obrigatória" só aceitam "Sim" ou vazio (um "S" perdia a protecção de uma tarefa crítica); IDs repetidos, Fim antes do Início, fases fora da lista e células com erro de fórmula param a conversão com a linha exacta. Categorias e papéis fora das listas dão avisos.

## Dependência nova: `exceljs` (só de desenvolvimento)

Para ler o Excel. Escolhida por ser mantida, ler `.xlsx` sem serviços externos e ter tipos TypeScript. A alternativa mais conhecida (`xlsx`/SheetJS) deixou de ser publicada no npm e a versão lá disponível tem vulnerabilidades conhecidas. A `exceljs` só é usada pelo conversor e pelos testes: **não entra na aplicação em produção**. Traz um aviso moderado numa dependência interna (`uuid`, numa função que não é usada aqui); a auditoria das dependências de produção continua com 0 vulnerabilidades.

## Ajustes à taxonomia

- **Papel "Registo"** acrescentado à lista de papéis. O T01 atribui-lhe 6 tarefas (presenças, clipping, relatórios). Opção recomendada ao Adriano; **a confirmar**. Se preferir, as tarefas passam para "Comunicação" e retira-se o papel.

## Pendente de decisão antes de lançar T02, T03 e T04

Estes templates usam valores fora das listas fechadas da folha Taxonomia. Os testes registam exactamente estas diferenças: uma nova faz o teste falhar.

| Template | Categorias de tarefa fora da lista | Papéis fora da lista | Categorias de orçamento fora da lista |
|---|---|---|---|
| T02 Casamento | Alojamento, Artístico, Produção, Segurança, Transporte | — | Legal |
| T03 Congresso | Alojamento, Produção, Segurança, Transporte | Legal | — |
| T04 Festival / Concerto | Alojamento, Artístico, Produção, Segurança, Transporte | Legal, Segurança | Legal |

Para cada um: ou se acrescenta à lista fechada (e aos gráficos e filtros), ou se corrige no Excel para uma categoria/papel existente.

## Ordem de lançamento

O Excel actual recomenda **T01 → T03 → T04 → T02** (o T04 entrou depois do `CLAUDE.md` ser escrito, que diz T01 → T03 → T02). **A confirmar pelo Adriano** e actualizar o `CLAUDE.md`.
