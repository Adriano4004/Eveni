# 027 — Administração dos planos

**Data:** 23/10/2026 · **Estado:** Em vigor

Enquanto não há pagamentos na aplicação, o plano de cada espaço de trabalho mudava-se à mão na base de dados. Passa a mudar-se num ecrã da aplicação.

## Decisões do Adriano (23/10/2026)

| Tema | Decisão |
|---|---|
| Quem é administrador | Os e-mails da variável `ADMINS` do Railway (hoje só `adrianosousa.as@gmail.com`). Para acrescentar alguém, junta-se outro e-mail, separado por vírgula |
| Segurança | O ecrã só funciona com a **verificação em dois passos** activa na conta do administrador |
| Descer de plano acima do limite | É permitido: o espaço mantém tudo o que tem, mas não pode criar mais projectos nem convidar mais pessoas até voltar a caber no limite |
| Aviso ao cliente | O dono do espaço recebe um e-mail ("O seu plano do Eveni passou a …"), que diz também se ficou acima do limite |
| Data do plano | A data de início do plano passa para o dia da mudança |

## Como funciona

- **Ecrã "Administração"** (`/admin`), com um botão no início só para os administradores. Para todos os outros, o ecrã e a API não existem (o servidor responde 404).
- **Lista dos espaços:**
  - mostra o nome, o dono (nome e e-mail), o plano e a data de início, e o número de projectos (arquivados incluídos) e de membros;
  - mostra no máximo 50 espaços, os mais recentes primeiro;
  - pesquisa por parte do e-mail do dono ou do nome do espaço;
  - assinala os espaços que estão acima do limite do plano.
- **Mudar o plano:**
  - o espaço fica bloqueado durante a mudança, para não se cruzar com a criação de um projecto ou um convite;
  - escolher o mesmo plano não muda nada e não envia e-mail;
  - cada mudança fica no registo de auditoria (`admin.plano_alterado`, com o plano anterior e o novo, quem mudou e o IP). Aparece também no registo que o dono do espaço vê.

## Consequência no limite do Singular

Até aqui, o limite do Singular contava os projectos criados desde o início do plano. Com a data do plano a recomeçar em cada mudança, um espaço que descesse para o Singular voltaria a poder criar um projecto, o que contraria o "1 projecto para sempre" (decisão 026) e a regra acima. Por isso, **o limite passa a contar todos os projectos do espaço, de sempre**, arquivados incluídos. Os planos pagos não têm limite de projectos, por isso a regra só afecta o Singular.

## O que o Adriano tem de fazer à mão

No Railway, nos serviços `staging` e `production`, criar a variável `ADMINS` com o valor `adrianosousa.as@gmail.com`. Depois, na aplicação, activar a verificação em dois passos nessa conta.
