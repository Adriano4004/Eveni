# 019 — Orçamento e fornecedores

**Data:** 20/10/2026 · **Estado:** Em vigor (Fase 6). Decisões do Adriano a 20/10/2026.

## Decisões do Adriano

1. **Fornecedor:**
   - dados guardados: nome, categoria, telemóvel, e-mail e notas (sem NIF nem dados bancários);
   - cada fornecedor pertence ao espaço de trabalho e serve para vários projectos.
2. **Avaliação depois do evento:** de 1 a 5 estrelas e um comentário curto, por evento. O fornecedor mostra a média.
3. **Pagamentos:** por agora, só o valor previsto e o real de cada rubrica (sem sinal nem "falta pagar").
4. **Contingência:**
   - calculada sozinha sobre o previsto das rubricas;
   - a percentagem pode ser alterada em cada projecto.
5. **Quem vê o orçamento:** as mesmas regras das tarefas.
   - Vê-o quem tem acesso ao projecto.
   - Alteram-no o dono e os editores, com o projecto activo.

## Regras do orçamento (primeiro PR)

- **Rubricas:**
  - cada rubrica tem uma categoria (lista fechada da folha Taxonomia), uma descrição, um valor previsto e um valor real;
  - os valores guardam-se em cêntimos de Kwanza, inteiros, até 100 mil milhões de Kz.
- **Valores escritos como as pessoas os escrevem:**
  - aceita `250 000`, `1 500 000,50`, `5.000.000` e `250 000 Kz`;
  - a vírgula marca as decimais;
  - os pontos e os espaços separam os milhares.
- **Rubricas do template:**
  - vêm a zero;
  - as **obrigatórias** não se removem, nem mudam de categoria ou descrição (pode pôr-se o valor a zero);
  - podem acrescentar-se rubricas próprias, até 300 por projecto.
- **Contingência:**
  - a rubrica "Contingência (N%)" do Excel passa a ser a percentagem do projecto: 10% no T01 e no T03, 15% no T02 e no T04;
  - o valor é calculado sozinho (previsto das rubricas × percentagem);
  - a percentagem pode ir de 0 a 50%;
  - os projectos já criados foram convertidos pela migração `0012`.
- **Totais e alertas:**
  - mostra o previsto das rubricas, a contingência, o total previsto e o real;
  - mostra também os totais de cada categoria;
  - a rubrica com o real acima do previsto fica marcada "Acima do previsto";
  - quando o real total passa o previsto das rubricas mas cabe na contingência, aparece um aviso ("está a gastar a contingência");
  - quando o real total passa também a contingência, aparece um alerta a vermelho, igualmente no ecrã do projecto.
- **Exportação:** os valores e a percentagem saem na exportação de dados do dono.

## Próximos PRs desta fase

2. Fornecedores do espaço de trabalho e ligação às rubricas do orçamento.
3. Avaliação dos fornecedores depois do evento.
