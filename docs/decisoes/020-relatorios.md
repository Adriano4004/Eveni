# 020 — Relatórios em PDF

**Data:** 21/10/2026 · **Estado:** Em vigor (Fase 7). Decisões do Adriano a 21/10/2026.

## Decisões do Adriano

1. **Três relatórios**, um PR para cada:
   - **para o cliente:** resumo e orçamento;
   - **interno:** tudo, incluindo fornecedores e notas;
   - **cronograma:** tarefas por data.
2. **No relatório para o cliente**, o orçamento mostra o **previsto e o real**.
3. **Marca da agência** (logótipo, cor, rodapé) só nos planos **Empresarial e Grandes**. No Singular, o PDF leva a marca do Eveni.
4. **Quem gera:** o dono e os editores do projecto. Os leitores não.

## Escolhas técnicas

- **PDF gerado no servidor com o `pdfkit`** (versão fixa 0.20.2):
  - só JavaScript, sem precisar de um browser dentro do servidor;
  - a alternativa, gerar o PDF com um Chromium, pesaria centenas de MB e gastaria mais memória no Railway.
  - `npm audit` sem vulnerabilidades nas dependências de produção.
- **Letra Liberation Sans** (2.1.5), em `assets/fontes`, com a licença SIL OFL 1.1 ao lado. Cobre todos os caracteres do português, e vai embutida no PDF (só as letras usadas), para se ver igual em qualquer telemóvel ou computador.
- **O conteúdo de cada relatório é montado à parte do desenho** (`src/server/relatorios/modelo.ts`): assim testa-se o que lá vai sem ter de ler o PDF.
- **Página A4**, com "Página n de N" e a marca no rodapé de todas as páginas. As tabelas continuam na página seguinte, com o cabeçalho repetido.
- **Nome do ficheiro sem acentos nem espaços** (ex.: `eveni-cliente-lancamento-kianda-2026-10-21.pdf`): alguns telemóveis estragam nomes com acentos ao descarregar.

## Regras

- **Os relatórios geram-se também com o projecto arquivado:** gerar só lê.
- **Cada relatório gerado fica no registo de actividade do espaço** (CLAUDE.md, secção 5, regra 14: exportações).
- **No máximo 60 relatórios por hora** por conta.
- **O relatório para o cliente** leva:
  - o resumo: tarefas concluídas, críticas em atraso e convidados;
  - os **marcos**, isto é, as tarefas críticas por ordem de prazo;
  - o **orçamento por categoria e rubrica**, com previsto e real, os totais com a contingência e o aviso se o real passou do previsto.
  - **Não leva** notas internas, fornecedores, contactos nem a equipa.
- **O relatório interno** (segundo PR) é para a equipa, não para o cliente: o subtítulo diz "não enviar ao cliente". Leva:
  - o resumo;
  - quem tem acesso ao projecto e com que papel;
  - **todas as tarefas** por fase, com prazo, responsável, estado, as críticas marcadas e a **nota** de cada uma;
  - o **orçamento com o fornecedor** de cada rubrica;
  - os **fornecedores escolhidos neste projecto**, com contactos, notas e avaliação média (os outros fornecedores do espaço não entram);
  - a **lista de convidados**, com telemóvel, resposta, acompanhantes e mesa. É útil no dia, à entrada e para o *follow-up* telefónico.
- **Os endereços dos relatórios** são `/api/projectos/<id>/relatorios/cliente.pdf` e `/api/projectos/<id>/relatorios/interno.pdf`. Qualquer outro nome dá "não encontrado".
- **O cronograma** (terceiro PR) leva as tarefas por data de início, agrupadas por semana (de segunda a domingo).
  - Para cada tarefa: datas, distância ao dia do evento (`D-12`, `D0`, `D+3`), título (as críticas marcadas), responsável e estado.
  - A semana do evento vem assinalada, e as tarefas em atraso a vermelho.
  - **Não leva** notas nem valores: pode ser partilhado com a equipa alargada ou com o cliente.
  - Endereço: `/api/projectos/<id>/relatorios/cronograma.pdf`. As regras de quem gera são as mesmas (dono e editores).
