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

## Fornecedores (segundo PR)

- **Quem vê e gere** (decisão de segurança por omissão; pode ser revista pelo Adriano):

| Pessoa | Lista do espaço (com contactos) | Escolher nas rubricas | Acrescentar | Alterar / apagar |
|---|---|---|---|---|
| Dono do espaço | Sim (ecrã "Fornecedores") | Sim | Sim | Sim |
| Editor do projecto | Sim, a partir do orçamento do projecto | Sim | Sim, a partir do orçamento | Não |
| Leitor do projecto | Não: vê só o nome do fornecedor de cada rubrica | Não | Não | Não |
| Fora do espaço | Não | Não | Não | Não |

  O leitor fica de fora porque pode ser, por exemplo, o cliente de uma agência, que não deve ver a lista de fornecedores nem os seus contactos.
- **Dados de cada fornecedor:**
  - nome, único no espaço sem ligar a maiúsculas;
  - categoria, das categorias do orçamento;
  - telemóvel, no mesmo formato dos convidados (`+244…`);
  - e-mail e notas (até 1000 caracteres).
  - No máximo 1000 fornecedores por espaço.
- **Fornecedor de outro espaço de trabalho é sempre recusado numa rubrica** (falha da versão anterior: IDOR no fornecedor do orçamento). Verifica-se em dois sítios:
  - no servidor;
  - na base de dados, com um gatilho, para nenhum caminho esquecido o contornar.
- **Apagar um fornecedor** tira-o das rubricas onde estava escolhido. Nunca apaga as rubricas.
- **Exportação:** os fornecedores dos espaços de que a pessoa é dona saem na exportação de dados.

## Avaliação dos fornecedores (terceiro PR)

- **Quando:** a partir do dia do evento, inclusive (calendário de Luanda).
- **Quem avalia:**
  - o dono do espaço e os editores do projecto;
  - também com o projecto arquivado, porque arquivar é o que se faz no fim do evento, e é então que se avalia.
  - Os leitores não vêem nem fazem avaliações.
- **Que fornecedores:** só os escolhidos nalguma rubrica do orçamento desse projecto. Isto garante que são do mesmo espaço; a base de dados verifica-o também, com o mesmo gatilho das rubricas.
- **Uma avaliação por fornecedor e por evento**, de 1 a 5 estrelas, com um comentário opcional (até 500 caracteres). Avaliar outra vez substitui a anterior.
- **Média:**
  - aparece na lista de fornecedores (ex.: "★ 4,3 (3 avaliações)");
  - o histórico, evento a evento, vê-se ao abrir o fornecedor (só o dono).
- **Dados da conta:**
  - a exportação inclui as avaliações dos fornecedores dos espaços de que a pessoa é dona e as que ela própria fez;
  - quando quem avaliou elimina a conta, a avaliação fica, mas anónima.
