# 018 — Convidados e RSVP

**Data:** 20/10/2026 · **Estado:** Em vigor (Fase 5). Decisões do Adriano a 20/10/2026.

## Decisões do Adriano

1. **Dados de cada convidado:** nome, telemóvel e e-mail. Não se guarda instituição, cargo nem outros dados: são dados de terceiros e recolhe-se só o necessário (Lei n.º 22/11).
2. **Entrada na lista:** um a um, ou colando linhas copiadas do Excel.
3. **Acompanhantes:** o organizador define, por convidado, quantos acompanhantes pode levar (0 a 10).
4. **Página de RSVP:** o convidado só responde "Vou" ou "Não vou" (e, se puder levar acompanhantes, quantos leva).
5. **Mesas e lugares:** fazem parte desta fase.
6. **Mudar a resposta:** o convidado pode mudar a resposta até ao dia do evento.
7. **Envio dos links:** por WhatsApp, com um botão (como os convites da equipa). O e-mail em massa fica para mais tarde, porque o plano gratuito da Resend não chega.

## Regras (primeiro PR: lista e importação)

- **Telemóvel e e-mail são opcionais**, porque há convidados sem contacto (ex.: "Tia Maria e família"). O nome é obrigatório.
- **Telemóvel guardado num só formato**, para detectar repetidos:
  - um número angolano escrito `923 456 789`, `+244 923 456 789` ou `00244923456789` fica sempre `+244923456789`;
  - números de outros países têm de vir com o indicativo (`+351…`).
- **Sem repetidos no mesmo projecto:** não pode haver dois convidados com o mesmo telemóvel nem com o mesmo e-mail. A base de dados também o garante.
- **Importação:**
  - colunas pela ordem Nome, Telemóvel, E-mail, Acompanhantes;
  - se a primeira linha tiver títulos (ex.: "Nome", "Contacto"), a ordem das colunas é lida dos títulos;
  - o ecrã mostra o que vai entrar e as linhas com problemas antes de importar;
  - as linhas repetidas (já na lista, ou duas vezes na mesma colagem) são ignoradas e listadas;
  - no máximo 500 linhas de cada vez.
- **Até 2000 convidados por projecto.** É um travão contra abusos, não um limite de plano.
- **Quem altera:**

| Pessoa | Vê a lista | Acrescenta, altera, remove, importa |
|---|---|---|
| Dono do espaço | Sim | Sim |
| Editor do projecto | Sim | Sim |
| Leitor do projecto | Sim | Não |
| Projecto arquivado | Sim | Não (restaurar primeiro) |
| Sem acesso ao projecto | Não ("Projecto não encontrado") | Não |

- **O organizador pode marcar a resposta à mão** (ex.: o convidado respondeu por telefone).
- **Exportação e eliminação:**
  - os convidados saem na exportação de dados de quem é dono do espaço, dentro de cada projecto;
  - são apagados com o projecto, isto é, com a conta do dono.

## Próximos PRs desta fase

2. Ligação de RSVP por convidado (token próprio), partilha por WhatsApp e página pública de resposta.
3. Mesas e lugares.
