# 007 — Confirmação de e-mail

**Data:** 19/10/2026 · **Estado:** Em vigor (Fase 1, segundo PR)

| Tema | Decisão | Porquê |
|---|---|---|
| Quando se envia | No registo, depois de a conta ficar gravada; e a pedido ("Reenviar e-mail") | Não se envia e-mail por uma conta que falhou |
| Ligação | Token aleatório de uso único, válido 48 horas; a base de dados guarda só o hash | Uma fuga da base de dados não permite confirmar contas alheias |
| Reenviar | Invalida a ligação anterior; no máximo 3 reenvios por hora por conta | Só a ligação mais recente vale; o Eveni não pode servir para encher a caixa de correio de alguém |
| Abrir a ligação | A ligação abre um ecrã que confirma com um pedido POST | Programas de e-mail e antivírus abrem ligações sozinhos para as verificar: um GET gastaria a ligação |
| Sessão para confirmar | Só confirma com sessão iniciada na conta a que a ligação pertence. Sem sessão, o ecrã pede para entrar primeiro e confirma logo a seguir | Sem isto, um atacante registava-se com o e-mail de outra pessoa e, se ela carregasse na ligação, ficava com uma conta confirmada nesse e-mail. Quem recebe o e-mail sem ter criado a conta não sabe a palavra-passe |
| Conteúdo do e-mail | Não inclui o nome escrito no registo; o nome não pode ter quebras de linha nem caracteres de controlo | Quem se regista pode não ser o dono do e-mail: o nome servia para pôr texto enganador num e-mail do Eveni |
| Depois de confirmar | O token sai do endereço do browser | Não fica no histórico |
| Sem confirmar | Entra e vê a aplicação; tudo o que cria conteúdo ou links públicos devolve 403 com explicação | `CLAUDE.md`, secção 5, regra 2 |
| Envio | Resend por HTTPS, com 10 segundos de limite; nunca bloqueia nem lança erros; falhas nos logs como `[email:erro] <código>` | `CLAUDE.md`, secção 5, regra 12 |
| Sem domínio ainda | Sem `RESEND_API_KEY`, o e-mail fica escrito nos logs (`[email:simulado]`) com a ligação, e o endereço parcialmente escondido (`a***@exemplo.ao`). Em produção a chave é obrigatória | Permite testar no staging antes de haver domínio, sem expor endereços completos nos logs |
| Contas nunca confirmadas | Apagadas automaticamente ao fim de **7 dias**, com o espaço pessoal. O aviso na página inicial diz isto | Sem isto, alguém podia registar-se com o e-mail de outra pessoa e ficar com ele para sempre. **A confirmar pelo Adriano** (o prazo é fácil de mudar) |
| Falha de rede ao confirmar | O ecrã oferece "Tentar de novo" com a mesma ligação | O token já saiu do endereço do browser; sem isto, a pessoa teria de voltar ao e-mail |

## Registo e contas existentes

Fica decidido que o registo continua a dizer "já existe uma conta com este e-mail". No PR anterior estava previsto esconder isto, mas é incompatível com a regra de quem não confirmou poder entrar: logo após o registo a pessoa entra, por isso um atacante distingue sempre uma conta nova de uma que já existia. Esconder exigiria confirmar o e-mail antes da primeira entrada.

A protecção fica no limite de 30 registos por hora por IP. Se no futuro se quiser esconder também isto, a alternativa é: o registo deixa de iniciar sessão e pede para abrir o e-mail primeiro.
