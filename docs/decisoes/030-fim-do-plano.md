# 030 — Fim do período pago

**Data:** 26/10/2026 · **Estado:** Em vigor

Esta decisão completa a 029 (pagamentos por transferência). Diz o que acontece quando um período pago acaba.

## Decisões do Adriano (26/10/2026)

| Tema | Decisão |
|---|---|
| Avisos | E-mail ao dono 7 dias antes do fim e no dia do fim |
| Tolerância | 7 dias depois do fim, com o plano ainda activo; depois, o espaço volta ao Singular |
| Renovação dentro da tolerância | O novo período conta a partir do fim do anterior: quem paga tarde não ganha dias a mais |
| Preços anuais | Confirmados: Empresarial 3 996 000,00 Kz, Grandes 6 912 000,00 Kz |

## Como funciona

- **Verificação de hora a hora**, que também corre no arranque da aplicação:
  - quando faltam 7 dias ou menos, envia o e-mail "O seu plano … acaba a …";
  - no fim do período, envia o e-mail "O seu plano … acabou hoje", com o dia em que o espaço volta ao Singular;
  - 7 dias depois do fim, o espaço volta ao Singular e o dono recebe o e-mail "O seu espaço voltou ao plano Singular". Fica registado na auditoria como `plano.expirado`.
- **Cada aviso sai uma só vez.** Fica registado na tabela `plan_notices`, mesmo que haja duas instâncias da aplicação a verificar ao mesmo tempo.
- **Comprovativo por confirmar:** enquanto houver um, não há avisos. Se foi enviado antes do fim da tolerância, também não há descida, porque o atraso é nosso e não do cliente.
  - Um comprovativo enviado já depois da tolerância não trava a descida. Assim, quem envie um comprovativo novo depois de cada recusa não fica no plano pago para sempre.
  - Um pedido sem comprovativo também não trava a descida.
- **Depois da descida:** o espaço mantém tudo o que tem. Se estiver acima do limite do Singular, não pode criar mais projectos nem convidar mais pessoas (como na decisão 027).
- **Renovação:**
  - se for confirmada antes da descida, conta a partir do fim do período anterior;
  - se o comprovativo ficou à espera e a tolerância passou, conta a partir do dia da confirmação.
- **Avisos nos ecrãs:** nos últimos 7 dias e durante a tolerância, o início e o ecrã "Plano e pagamentos" mostram o aviso. Ao renovar, o plano actual já vem escolhido.
- **Termos:** acrescentado o parágrafo sobre os avisos e a tolerância.
