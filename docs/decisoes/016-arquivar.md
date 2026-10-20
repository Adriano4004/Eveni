# 016 — Arquivar e restaurar projectos

**Data:** 20/10/2026 · **Estado:** Em vigor (Fase 3, terceiro PR)

## Regras

- **Não há eliminação de projectos pelo utilizador**, como manda o `CLAUDE.md` (secção 8). Os projectos só podem ser **arquivados** e **restaurados**.
- **Quem pode:** só o **dono do espaço de trabalho**.
  - Os outros membros, que chegam na Fase 4, vêem o projecto mas não o arquivam. O servidor responde que só o dono pode.
  - Para quem não tem acesso ao projecto, este não existe: recebe a mesma resposta que um projecto inexistente.
- **O que muda ao arquivar:**
  - o projecto sai da lista principal e passa para "Arquivados", no ecrã de início;
  - fica **só de leitura**: as tarefas não podem ser alteradas, e o servidor também o impede;
  - deixam de aparecer alertas de atraso.
- **Limite do plano:** um projecto arquivado **continua a contar**. Arquivar não liberta lugar para um projecto novo no plano Singular.
- **Confirmação:** antes de arquivar, o ecrã pede confirmação. Restaurar não pede, porque não há nada a perder.
- **Pedidos repetidos:** arquivar um projecto já arquivado (ou restaurar um activo) não muda nada e não regista nada.
- **Auditoria:** cada arquivo e restauro fica no registo de auditoria (`projecto.arquivado`, `projecto.restaurado`), com a pessoa e o IP.
- **Pedidos em simultâneo:** arquivar e alterar uma tarefa ao mesmo tempo não se atropelam. O projecto fica bloqueado durante cada uma das operações.
