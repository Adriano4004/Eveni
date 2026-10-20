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

## Ligações de RSVP (segundo PR)

- **Uma ligação por convidado** (`/rsvp?token=…`). Responde só por aquele convidado e nunca cria convidados novos (falha da versão anterior).
- **Como é feita a ligação:**
  - leva a chave do convidado mais uma assinatura feita com o segredo da aplicação (`SESSION_SECRET`);
  - quem obtiver só uma cópia da base de dados não consegue responder por ninguém;
  - **se `SESSION_SECRET` mudar, todas as ligações já enviadas deixam de funcionar.**
- **Quem obtém a ligação:** só o dono e os editores, com o projecto activo. Os leitores não, porque com ela se responde em nome do convidado.
- **Na lista e na exportação** a ligação não aparece. Pede-se convidado a convidado, no momento de a partilhar.
- **"Gerar nova ligação"** troca a chave, e a ligação antiga deixa de funcionar (ex.: foi enviada à pessoa errada).
- **Partilha:**
  - botão "Enviar por WhatsApp", que abre a conversa com o número do convidado (ou, sem número, deixa escolher o contacto) com a mensagem já escrita;
  - botão "Copiar ligação".
- **Página pública:**
  - mostra só o nome do evento, a data, o local e o nome do convidado (nada da equipa nem dos outros convidados);
  - o convidado escolhe "Vou" ou "Não vou" e, se puder levar acompanhantes, quantos;
  - pode mudar a resposta **até ao dia do evento, inclusive** (calendário de Luanda);
  - com o projecto arquivado, as respostas fecham;
  - os pedidos são limitados por endereço IP. O limite é largo, porque muitos convidados da mesma operadora móvel podem partilhar o mesmo IP.
- **O token não fica registado:** sai da barra de endereço logo à entrada e não é escrito nos logs.

## Próximo PR desta fase

3. Mesas e lugares.
