# 009 — Verificação em dois passos (2FA)

**Data:** 20/10/2026 · **Estado:** Em vigor (Fase 1, quarto PR)

| Tema | Decisão | Porquê |
|---|---|---|
| Tipo | TOTP (RFC 6238): códigos de 6 dígitos de uma aplicação (Google Authenticator, Microsoft Authenticator, Authy). Opcional para todos | `CLAUDE.md`, secção 5, regra 4. Funciona sem rede no telemóvel e sem custos de SMS |
| Implementação | Algoritmo escrito no projecto (≈60 linhas, com os vectores de teste da RFC); só o código QR usa uma biblioteca (`qrcode`) | Uma dependência a menos num ponto sensível |
| Segredo | Cifrado na base de dados (AES-256-GCM, chave derivada de `SESSION_SECRET`) | Uma fuga só da base de dados não permite gerar códigos. **Mudar `SESSION_SECRET` invalida os segredos guardados**: o código da aplicação passa a dar "incorrecto" (com registo nos logs) e quem tem 2FA tem de usar um código de recuperação |
| Quem pode activar | Só contas com o e-mail confirmado. Se uma conta nunca confirmada for recuperada pelo e-mail, o 2FA que lá estiver é apagado | Quem registou o e-mail de outra pessoa não pode activar o 2FA para impedir o verdadeiro dono de recuperar a conta |
| Activar | Gera o QR; só fica activo depois de um código certo **e** da palavra-passe; termina as outras sessões | Prova que a aplicação ficou configurada; quem roubar uma sessão aberta não consegue activar o 2FA com o seu telemóvel, e quem activa por desconfiar de uma sessão roubada fica logo protegido |
| Códigos de recuperação | 10, de uso único, formato `ABCDE-FGHJK` (sem I, O, 0, 1), mostrados uma só vez, guardados em hash | Para quem perde o telemóvel. Usar um código envia um aviso por e-mail com quantos restam |
| Entrar | Palavra-passe certa → pede o código (entrada a meio válida 5 minutos, máx. 5 tentativas). Só os códigos errados contam: 5 por hora por conta e IP, 20 por hora por conta no total. A tentativa conta-se antes de verificar e é descontada se estiver certa | Quem sabe a palavra-passe não pode recomeçar a entrada para ter tentativas infinitas, nem bloquear o dono a partir de um só sítio; entradas certas nunca gastam o limite |
| Repetição | Cada código só serve uma vez (guarda-se o último intervalo de 30 s usado) | Um código visto por cima do ombro não volta a servir |
| Desactivar / códigos novos | Palavra-passe e um código (da aplicação ou de recuperação); aviso por e-mail | Acções sensíveis com dupla confirmação |
| Recuperar a palavra-passe | **Não** desliga o 2FA | Quem só tem acesso ao e-mail não entra na conta |
| Telemóvel e códigos perdidos | Sem solução automática: o Adriano verifica a identidade e desliga o 2FA à mão na base de dados | Qualquer via automática seria uma porta para atacantes. A documentar quando houver suporte |
