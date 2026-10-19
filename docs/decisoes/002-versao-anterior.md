# 002 — Versão anterior descontinuada

**Data:** 19/10/2026 · **Estado:** Aprovada pelo Adriano

## Decisão

- A versão anterior (repositório `Planeador-eventos`) **não tem utilizadores reais** e é descontinuada.
- A nova versão **começa com a base de dados vazia**. Não há migração de dados.
- Do repositório antigo aproveita-se apenas conteúdo, nunca código: o logo e os dados dos templates (T01–T04).

## Descoberta

O repositório antigo tem os quatro templates extraídos do ficheiro `Eveni-Templates-Projecto_v2.xlsx`, **incluindo o T04 (86 tarefas, 49 críticas)**, que se julgava perdido. O conversor antigo tinha um erro: lia as linhas de totais do Excel como tarefas. O novo conversor tem testes que impedem isso.

## O que o Adriano tem de fazer à mão

- No Railway, desligar os serviços da versão anterior quando o novo `staging` estiver a funcionar.
