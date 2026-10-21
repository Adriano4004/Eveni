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

## Marca da agência (quarto PR) — decisões do Adriano a 21/10/2026

1. **A marca da agência aparece nos três relatórios:** para o cliente, interno e cronograma.
2. **Fica uma menção discreta "Feito com Eveni"** no rodapé.
3. **A agência configura:**
   - o logótipo (PNG ou JPG, até 500 KB);
   - a cor principal;
   - um texto de rodapé (até 200 caracteres).

### Regras

- **Só nos planos Empresarial e Grandes.** No Singular o ecrã explica que não está incluído, e os PDF levam a marca do Eveni. Se um espaço passar ao Singular, a marca fica guardada mas deixa de ser usada.
- **Quem configura:** só o dono, no seu próprio espaço (ecrã "Marca nos relatórios", no início).
- **Nos PDF de um projecto usa-se a marca do espaço desse projecto**, mesmo quando é um editor de outro espaço que gera o relatório.
- **O logótipo:**
  - guarda-se na base de dados (sem serviço de ficheiros à parte);
  - o servidor confirma que é mesmo PNG ou JPEG pelos primeiros bytes (o tipo declarado não basta) e que tem no máximo 500 KB;
  - SVG e outros formatos são recusados;
  - um logótipo estragado nunca impede o PDF: sai sem ele.
- **Verificação estrutural do logótipo (`src/server/relatorios/imagens.ts`).** A biblioteca de PDF confia no ficheiro, e a revisão de segurança mostrou que um PNG feito de propósito podia bloquear o servidor, fazê-lo cair ou esgotar a memória. Por isso, antes de o guardar e antes de o pôr num PDF:
  - **PNG:**
    - cada bloco tem de caber no ficheiro e ter o CRC certo, com o IHDR primeiro e o IEND no fim;
    - no máximo 2000 × 2000 píxeis;
    - os entrelaçados são recusados;
    - a imagem é descomprimida inteira, com um tecto de tamanho, e tem de dar exactamente o tamanho esperado;
    - o filtro de cada linha tem de ser válido;
    - PNG animados (APNG) são recusados.
  - **JPEG:**
    - os blocos são lidos do mesmo modo que a biblioteca de PDF os lê, mas sem tolerâncias, para as duas leituras não poderem divergir;
    - as dimensões (no máximo 2000 × 2000) e os canais têm de ser razoáveis.
  - **No fim**, a biblioteca de PDF tem de ter lido exactamente as mesmas dimensões que esta verificação.
  - **Node.js 22.12 ou mais recente**, por causa do cálculo do CRC (`package.json`).
- **Nos PDF:**
  - o logótipo vai no topo, no lugar de "Eveni · Gestão de eventos";
  - a cor vai nos títulos das secções;
  - o rodapé da agência fica por cima de "Feito com Eveni · Página n de N".
- **Exportação:** a cor, o rodapé e o logótipo saem na exportação de dados do dono, e são apagados com o espaço.
