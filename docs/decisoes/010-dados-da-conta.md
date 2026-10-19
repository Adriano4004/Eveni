# 010 — Exportação e eliminação dos dados da conta

**Data:** 20/10/2026 · **Estado:** Em vigor (Fase 1, quinto PR)

Cumpre a Lei n.º 22/11 (Protecção de Dados Pessoais) e o `CLAUDE.md`, secção 6. Na versão anterior, a exportação e a eliminação estavam incompletas.

| Tema | Decisão | Porquê |
|---|---|---|
| Exportar | Ficheiro JSON com conta, espaços de trabalho, sessões e histórico de acessos; pede a palavra-passe | Uma sessão esquecida aberta não basta para levar os dados de alguém |
| O que não se exporta | Hashes, segredo do 2FA, códigos de recuperação, tokens | São segredos, não dados sobre a pessoa |
| Eliminar | Pede a palavra-passe, o código do 2FA (se activo) e escrever ELIMINAR; apaga a conta, os espaços de que é a única dona, sessões, ligações, códigos, o histórico de acessos e os contadores de tentativas que incluem o e-mail | Eliminação completa; acção irreversível com tripla confirmação |
| Depois de eliminar | Fica só um registo "conta.eliminada" sem nada que identifique a pessoa; segue um e-mail de confirmação | Prova de que a eliminação aconteceu, sem guardar dados pessoais |
| Espaços com outros membros | Recusa eliminar até o espaço ser transferido | Não apagar o trabalho de outras pessoas (relevante a partir da Fase 4, colaboração) |
| Contas nunca confirmadas | A limpeza automática dos 7 dias usa a mesma eliminação completa | Um só caminho, testado |
| Salvaguarda | `TABELAS_PESSOAIS` (em `src/server/contas/dados.ts`) lista todas as tabelas e como são exportadas e eliminadas. Um teste falha se aparecer uma tabela nova que não esteja na lista | As fases seguintes (projectos, convidados, fornecedores, orçamento) não podem esquecer-se de as incluir |

## Fora do código (para o Adriano tratar com um advogado)

- **Política de privacidade e termos de utilização:** o `CLAUDE.md` exige que estejam acessíveis na aplicação. O texto tem de ser escrito ou revisto por um advogado; quando existir, o Claude Code coloca-o na aplicação.
- **Alojamento fora de Angola (Railway)** exige fundamento legal, e há a **notificação prévia à APD**.
