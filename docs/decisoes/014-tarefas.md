# 014 — Trabalhar as tarefas: estado, responsável e atrasos

**Data:** 20/10/2026 · **Estado:** Em vigor (Fase 3, primeiro PR)

## Estado

- Cada tarefa tem três estados: **Por fazer**, **Em curso** e **Concluída**.
- Para concluir uma tarefa, basta tocar na caixa ao lado dela. A caixa fica marcada logo, mesmo em redes lentas. Se o servidor recusar a alteração, volta ao estado anterior.
- Guarda-se a data e a hora em que a tarefa foi concluída. Voltar a marcá-la como concluída não muda essa data.

## Responsável

- O responsável é uma **pessoa real**, membro do espaço de trabalho do projecto. Não é texto livre.
- O **papel** do template (Gestor, Produção…) continua a aparecer. Diz que tipo de pessoa costuma fazer a tarefa.
- O servidor confirma sempre que o responsável escolhido pertence ao espaço do projecto. Um ID de outra pessoa enviado no pedido é recusado. Esta foi a falha da versão anterior com o fornecedor do orçamento.
- Se a conta do responsável for eliminada, a tarefa fica sem responsável.
- A lista de pessoas que se podem escolher mostra só os nomes, nunca o e-mail.
- Por agora, cada espaço só tem o dono. Os convites e os papéis por projecto (dono, editor, leitor) chegam na Fase 4. Até lá, todos os membros do espaço podem alterar as tarefas.

## Atrasos

- Uma tarefa está **em atraso** quando não está concluída e o prazo (o dia em que deve acabar) já passou, no calendário de Luanda. Uma tarefa que acaba hoje ainda não está em atraso.
- **As tarefas críticas em atraso** aparecem:
  - num alerta no topo do projecto, com os prazos;
  - no cartão do projecto, no ecrã de início.
- Por agora, os alertas aparecem só na aplicação. Avisos por e-mail ou WhatsApp ficam para mais tarde: o plano gratuito da Resend tem poucos e-mails por dia, e o WhatsApp ainda não está ligado.

## Projectos arquivados

Um projecto arquivado pode ser consultado, mas as tarefas não podem ser alteradas: o servidor recusa. Arquivar e restaurar chegam num PR seguinte desta fase.

## Progresso por categoria

Para cada categoria, mostra quantas tarefas estão concluídas. Fica numa secção que se abre com um toque, para não ocupar o ecrã no telemóvel.
