# 011 — Dados dos templates

**Data:** 20/10/2026 · **Estado:** Em vigor (Fase 2, primeiro PR; taxonomia e ordem decididas a 20/10/2026)

## Fonte e conversão

- **Fonte única:** `docs/templates/Eveni-Templates-Projecto.xlsx`. Os textos das tarefas, as notas e as rubricas mudam-se **no Excel**, nunca nos ficheiros de dados.
- **Conversão:** `npm run templates:converter` gera `data/templates/taxonomia.json` e um ficheiro por template (`T01.json`…`T04.json`). Um teste volta a converter o Excel e falha se os ficheiros não estiverem actualizados.
- **Versão:** cada template tem um identificador do conteúdo (`versao`, um hash). Muda sempre que o template muda. Os projectos vão guardar a versão com que foram criados: alterar um template não altera projectos existentes.
- **Datas:** os offsets do Excel (`D-21`, `D0`, `D+7`) passam a números de dias (`-21`, `0`, `7`). `Fim` vazio passa a ser igual ao `Início` (tarefa de um dia).
- As linhas de totais no fim de cada folha não são tarefas: o conversor ignora linhas sem ID. Na versão anterior, eram lidas como tarefas.
- **O conversor recusa erros em vez de os passar para o produto:** "Crítica" e "Obrigatória" só aceitam "Sim" ou vazio (um "S" perdia a protecção de uma tarefa crítica); IDs repetidos, Fim antes do Início, fases fora da lista e células com erro de fórmula param a conversão com a linha exacta. Categorias e papéis fora das listas dão avisos.

## Dependência nova: `exceljs` (só de desenvolvimento)

Para ler o Excel. Escolhida por ser mantida, ler `.xlsx` sem serviços externos e ter tipos TypeScript. A alternativa mais conhecida (`xlsx`/SheetJS) deixou de ser publicada no npm e a versão lá disponível tem vulnerabilidades conhecidas. A `exceljs` só é usada pelo conversor e pelos testes: **não entra na aplicação em produção**. Traz um aviso moderado numa dependência interna (`uuid`, numa função que não é usada aqui); a auditoria das dependências de produção continua com 0 vulnerabilidades.

## Ajustes à taxonomia (decididos pelo Adriano a 20/10/2026)

Os templates usavam valores que não estavam nas listas da folha Taxonomia. O Adriano decidiu **acrescentá-los às listas**, porque reflectem trabalho real (segurança num festival, alojamento de oradores, licenças):

| Lista | Valores acrescentados | Onde são usados |
|---|---|---|
| Categorias de tarefa | Alojamento, Artístico, Produção, Segurança, Transporte | T02, T03, T04 |
| Papéis | Registo | T01 (presenças, clipping, relatórios) |
| Papéis | Legal, Segurança | T03, T04 |
| Categorias de orçamento | Legal | T02 (registo civil), T04 (licenças, direitos de autor, vistos) |

Os valores estão em `scripts/converter-templates.ts`. Quando o Excel for actualizado, convém acrescentá-los também à folha Taxonomia.

Desde esta decisão, **as listas são fechadas a sério**: um valor fora delas pára a conversão do Excel, com a linha exacta, em vez de dar apenas um aviso.

## Ordem de lançamento (decidida pelo Adriano a 20/10/2026)

**T01 Conferência de Imprensa → T03 Congresso → T04 Festival / Concerto → T02 Casamento**, como no Excel. O `CLAUDE.md` foi actualizado.
