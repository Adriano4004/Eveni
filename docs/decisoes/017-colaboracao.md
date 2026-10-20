# 017 — Colaboração: convites e acesso por projecto

**Data:** 20/10/2026 · **Estado:** Em vigor (Fase 4). Decisões do Adriano a 20/10/2026.

## Decisões do Adriano

1. **Convites:**
   - Agora, por **link** a partilhar por WhatsApp.
   - O dono escreve o e-mail da pessoa e o Eveni gera um link de uso único, válido 7 dias. O link só funciona com esse e-mail.
   - Quando houver domínio, o mesmo convite passa também a ser enviado por e-mail.
2. **Acesso:** cada membro só tem acesso aos **projectos que lhe forem dados**, projecto a projecto, como **editor** ou **leitor**. Isto serve, por exemplo, uma agência com clientes diferentes.
3. **Limite do plano Empresarial:** **10 pessoas no total, contando com o dono.**
   - O plano Grandes não tem limite.
   - O plano Singular não tem colaboração.

## Regra de acesso aos projectos (primeiro PR da Fase 4)

| Pessoa | Vê o projecto | Altera tarefas | Arquiva / restaura |
|---|---|---|---|
| Dono do espaço de trabalho | Sim (todos os projectos do espaço) | Sim | Sim |
| Editor do projecto | Sim | Sim | Não |
| Leitor do projecto | Sim | Não | Não |
| Membro do espaço sem acesso a este projecto | Não ("Projecto não encontrado") | Não | Não |
| Qualquer outra pessoa | Não ("Projecto não encontrado") | Não | Não |

- **Uma só regra, na base de dados:** a função `papel_no_projecto(projecto, utilizador)`. Todas as consultas de projectos a usam, para não haver uma rota esquecida com uma regra diferente.
- **Editores e leitores têm de ser também do espaço** do projecto. Quem sai do espaço perde logo o acesso a todos os projectos desse espaço, mesmo que algum registo de acesso tenha ficado esquecido.
- **Responsável por uma tarefa:** só pode ser o dono do espaço ou um editor do projecto. Não basta ser do espaço de trabalho, e um leitor também não pode, porque não conseguiria marcar a tarefa como feita.
- **A lista de projectos** é feita a partir dos acessos da própria pessoa. Assim, não percorre os projectos de todas as contas.
- **Exportação de dados:** a exportação de um membro inclui os projectos de outros espaços a que tem acesso, com o papel e a data desde quando o tem.
- **Retirar uma pessoa de um projecto:** perde o acesso no pedido seguinte, porque as sessões não guardam permissões.
- **Eliminar a conta de um membro:** apaga os seus acessos, e as tarefas que lhe estavam atribuídas ficam sem responsável.

## O que os convites e a gestão de membros (próximo PR) têm de garantir

Resultado da revisão de segurança deste PR:

1. **Quem gere:** só o dono do espaço cria e revoga convites, adiciona e retira pessoas dos projectos e muda papéis. Há testes para cada outro tipo de pessoa: editor, leitor, membro sem acesso e alguém de fora.
2. **IDs no pedido:**
   - cada projecto e cada pessoa enviados no pedido têm de pertencer ao espaço do dono, sempre verificado no servidor;
   - o papel só pode ser editor ou leitor.
3. **Tokens dos convites:**
   - aleatórios e guardados só em hash;
   - de uso único, válidos 7 dias e revogáveis;
   - aceites só por quem tem sessão com o e-mail convidado, e esse e-mail confirmado;
   - limitação de pedidos na aceitação.
4. **Limite do plano:**
   - no plano Singular não há convites;
   - no Empresarial, o limite é de 10 pessoas, contando membros e convites pendentes. A contagem é feita com o espaço bloqueado, e verificada outra vez ao aceitar o convite.
5. **Sair do espaço:**
   - os acessos aos projectos desse espaço são apagados na mesma operação;
   - as tarefas atribuídas a essa pessoa ficam sem responsável;
   - fica registado na auditoria.
6. **Dados pessoais:**
   - a nova tabela de convites entra em `TABELAS_PESSOAIS`;
   - exportam-se os convites enviados e recebidos;
   - ao eliminar a conta, apagam-se os convites que a pessoa criou e os que foram feitos para o e-mail dela.
7. **Sem fugas de dados:** as listas de membros e de convites, com e-mails, só são visíveis ao dono.
8. **Auditoria:** fica registado quando um convite é criado, aceite ou revogado, quando um membro é adicionado ou retirado, e quando um papel muda.
9. **O espaço da própria pessoa continua a ser o principal:** aceitar um convite não muda onde ela cria os seus projectos.

## Convites e equipa (segundo PR da Fase 4)

- **Ecrã "Equipa"**, no início. Mostra:
  - os membros do espaço, com o e-mail (só o dono vê este ecrã);
  - os convites por aceitar;
  - quantas pessoas ocupam o plano.
- **Convidar.** O dono escreve o e-mail da pessoa e o Eveni cria uma **ligação de uso único**, válida 7 dias. A ligação:
  - aparece uma só vez, com os botões **Partilhar no WhatsApp** e **Copiar ligação**;
  - é também enviada por e-mail, quando a Resend estiver configurada (até lá, fica só nos logs);
  - não fica guardada: na base de dados fica apenas o hash do token.
- **Convidar de novo o mesmo e-mail** anula a ligação anterior.
- **Aceitar.** A pessoa abre a ligação e vê quem a convidou e para que equipa, com o e-mail parcialmente escondido.
  - Se não tiver sessão, entra ou cria conta, e o Eveni volta ao convite.
  - Só aceita com sessão na conta do **e-mail convidado, já confirmado**.
- **Ao entrar na equipa,** a pessoa **não vê nenhum projecto** até o dono lhe dar acesso. O espaço principal dela continua a ser o seu: é aí que cria os seus projectos.
- **Limite do plano:**
  - Singular: sem equipa.
  - Empresarial: 10 pessoas, contando com o dono e com os convites por aceitar.
  - Grandes: sem limite.
  - O limite é verificado ao convidar e outra vez ao aceitar, com o espaço bloqueado, para que pedidos em simultâneo não o passem.
- **Retirar alguém** apaga, na mesma operação:
  - a entrada na equipa;
  - os acessos aos projectos desse espaço;
  - a atribuição das tarefas desses projectos.
- **Auditoria:** fica registado quando um convite é criado, revogado ou aceite, e quando alguém é retirado. O e-mail convidado não vai para a auditoria, porque é um dado de terceiro.
- **Dados pessoais:**
  - a exportação inclui os convites enviados e recebidos;
  - eliminar a conta apaga os convites que a pessoa criou e os feitos para o e-mail dela;
  - convites aceites, revogados ou expirados há mais de 30 dias são apagados sozinhos.
- **Limitação de pedidos:**
  - 20 convites por hora por dono;
  - 30 pedidos de ver ou aceitar convites a cada 15 minutos por IP.
- **Limite diário de e-mails de convite:** 10 por espaço e 40 no total. Acima disso, o convite é criado na mesma, mas só se partilha pelo WhatsApp. O plano gratuito da Resend dá 100 e-mails por dia para tudo, e as confirmações e recuperações de palavra-passe não podem ficar sem quota.
- **Contas por confirmar:** os convites feitos para um e-mail só entram na exportação e na eliminação depois de a conta confirmar esse e-mail. Uma conta por confirmar pode ser de outra pessoa.
- **Logs do servidor:** os tokens das ligações (`?token=`) aparecem sempre escondidos. Isto vale para os convites, a confirmação de e-mail e a recuperação de palavra-passe.
- **Texto livre nos e-mails:** o nome de quem convida e o nome do espaço são escolhidos pelo dono. Vão escapados, mas o texto não é verificado. Por isso só os planos pagos convidam, com os limites acima. Se aparecer abuso, a opção seguinte é tirar esses nomes do e-mail.

Ainda não existe nesta fase:
- dar acesso a um projecto a um membro (próximo PR);
- um membro sair sozinho de uma equipa.
