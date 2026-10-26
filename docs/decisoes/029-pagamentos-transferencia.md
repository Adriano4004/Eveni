# 029 — Pagamentos por transferência bancária

**Data:** 26/10/2026 · **Estado:** Em vigor (primeira parte)

Os planos pagos passam a pagar-se dentro da aplicação, por transferência bancária. O Multicaixa Express fica para depois.

## Decisões do Adriano (26/10/2026)

| Tema | Decisão |
|---|---|
| Conta | BLUE BERN Comércio Geral e Prestação de Serviços, Lda. · Banco Millennium Atlântico · conta 1463 33 33 810001 · IBAN AO06 0055 0000 4633 3338 1012 8 |
| Períodos | Mensal ou anual. No anual, 10% de desconto sobre 12 meses: Empresarial 3 996 000,00 Kz, Grandes 6 912 000,00 Kz |
| Comprovativo | Enviado na aplicação (PDF, JPG ou PNG, até 5 MB) |
| Fim do período | Há uns dias de tolerância antes de voltar ao Singular (número de dias por decidir; fica para a segunda parte) |
| Facturas | Emitidas fora da aplicação, num programa certificado pela AGT |

## Como funciona

- **Ecrã "Plano e pagamentos"** (`/conta/plano`), com um botão no início.
  - Mostra o plano actual e a data de fim.
  - Só o dono do espaço pede e paga, e sempre para o seu próprio espaço.
- **Pedido:**
  - o dono escolhe o plano (Empresarial ou Grandes) e o período;
  - o valor é calculado no servidor, nunca vem do browser;
  - cada pedido recebe uma referência curta (`EVN-2026-00007`) para o descritivo da transferência;
  - só pode haver um pedido em aberto de cada vez.
- **Comprovativo:**
  - o servidor confirma pelo conteúdo que o ficheiro é mesmo PDF, PNG ou JPEG;
  - os administradores recebem um e-mail;
  - enquanto o pagamento não for decidido, pode enviar outro comprovativo ou cancelar o pedido; ao cancelar, o comprovativo é apagado.
- **Administração:**
  - os pagamentos por confirmar aparecem no ecrã de administração, onde se pode descarregar o comprovativo;
  - **Confirmar** activa o plano e envia um e-mail ao dono. O período dura 1 ou 12 meses e começa no dia da confirmação; numa renovação do mesmo plano, começa no fim do período actual;
  - **Recusar** exige um motivo, que o dono lê no e-mail e no histórico.
- **Mudança à mão:** uma mudança de plano feita na administração (decisão 027) retira a data de fim.
- **Registo de auditoria:** `pagamento.pedido`, `pagamento.comprovativo`, `pagamento.cancelado`, `pagamento.confirmado` e `pagamento.recusado`.
- **Dados pessoais:**
  - a exportação inclui os pagamentos e os comprovativos;
  - eliminar a conta apaga-os juntamente com o espaço.
- **Termos e privacidade:** foram actualizados (versão de 26/10/2026), por isso cada conta volta a aceitá-los na entrada seguinte.

## Fica para a segunda parte

- Avisos por e-mail antes do fim do período.
- Regresso ao Singular depois dos dias de tolerância.

## Assuntos fora do código

- **Facturas:** têm de sair de um programa certificado pela AGT.
- **Conservação:** a lei pode obrigar a guardar os documentos de pagamento durante vários anos. Hoje, eliminar a conta apaga também os pagamentos, por isso convém guardar uma cópia fora da aplicação (por exemplo, junto da factura).
