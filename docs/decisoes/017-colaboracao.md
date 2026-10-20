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
- **Responsável por uma tarefa:** só pode ser alguém com acesso ao projecto. Não basta ser do espaço de trabalho.
- **Retirar uma pessoa de um projecto:** perde o acesso no pedido seguinte, porque as sessões não guardam permissões.
- **Eliminar a conta de um membro:** apaga os seus acessos, e as tarefas que lhe estavam atribuídas ficam sem responsável.
