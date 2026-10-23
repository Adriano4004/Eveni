# 028 — Página pública

**Data:** 23/10/2026 · **Estado:** Em vigor (pedida pelo Adriano: "design jovem e atraente")

## Onde fica

- Sem sessão iniciada, o endereço principal (`/`) mostra a página pública. Com sessão, continua a mostrar o início da aplicação.
- É servida pelo mesmo serviço do Railway: não há uma peça nova para gerir.
- Os outros endereços sem sessão continuam a levar à entrada. Quem termina a sessão volta à entrada, não à página pública.
- Quando o domínio estiver ligado, `eveni.ao` e `app.eveni.ao` podem apontar para o mesmo serviço.

## O que mostra

1. **Abertura:** "Cada evento tem um dia D. O Eveni trata do caminho até lá.", com os botões "Criar conta grátis" e "Já tenho conta". Ao lado aparece a peça forte da página: a **contagem decrescente** de um casamento a 3 meses (D-90 → D-45 → D-30 → D-15 → D0), com tarefas reais do template. Aparece uma vez, paragem a paragem. Quem pede menos movimento no telemóvel vê-a sem animação.
2. **Tipos de evento:** os 7 templates, com o público de cada um e uma barra do horizonte, de 21 dias (conferência de imprensa) a 12 meses (casamento).
3. **Notas:** três notas reais, palavra por palavra (o follow-up telefónico, o gerador, a época das chuvas). São a vantagem do Eveni.
4. **O resto:** convidados e RSVP por WhatsApp, orçamento em Kwanza, equipa, relatórios com a marca da agência.
5. **Planos:** os preços da decisão 003.
6. **Fecho:** "Marque a data. O plano vem a seguir.", com o botão de criar conta, e o rodapé com os termos, a privacidade e a BLUE BERN.

## Escolhas de desenho (segunda versão, 23/10/2026)

A primeira versão foi recusada pelo Adriano ("básica, com cara de IA"). A segunda inspira-se no weddings.ao, por pedido dele:

- **Topo escuro**, com uma fotografia a toda a largura e um véu roxo-noite. O título fica em branco e muito grande.
- **A contagem até ao dia D como um bilhete de evento**, com picotado e o talão amarelo do D0.
- **Faixa escura a deslizar** com os tipos de evento.
- **Mosaico de fotografias** dos tipos de evento, com o casamento em destaque. Cada peça tem o nome, o público, o prazo e uma barra do horizonte.
- **As notas como conversa** numa secção escura, porque é assim que este conhecimento circula.
- **Planos**, com o Empresarial em destaque, e um **fecho** escuro e arredondado com uma colagem de fotografias.
- **Cores do Eveni:** roxo, roxo-noite e amarelo-girassol. O rosa do weddings.ao ficou de fora, para o Eveni não se parecer com ele.
- **Letra dos títulos:** *Bricolage Grotesque*, aprovada pelo Adriano.
  - Licença aberta OFL; a licença está em `public/fontes/`.
  - Um ficheiro de 41 KB, servido pela própria aplicação, sem serviços externos.
  - O texto corrido continua com a letra do sistema.
- **Fotografias** em `public/fotos/`. A lista está em `FOTOS`, em `src/web/ecra-publica.tsx`.
  - Fornecidas pelo Adriano a 23/10/2026 e geradas por IA.
  - Convertidas para WebP, com 60–80 KB cada.
  - Na foto do palco foi apagado um logótipo ("d.") que parecia a marca de uma empresa real.
  - A conferência de imprensa e o festival receberam fotos a 23/10/2026.
  - O fórum continua sem foto. As duas propostas mostravam marcas reais ("Harvey Forum", "World Economic Forum") e pessoas que parecem reais, por isso não foram usadas.
- **Movimento:** o bilhete aparece uma vez e a faixa desliza devagar. Tudo pára para quem pede menos movimento no telemóvel.

## Salvaguardas

Um teste confirma que os números dos templates na página (horizonte e tarefas) batem certo com os templates, que as notas citadas são exactamente as do Excel e que os preços são os da decisão 003. Se um template mudar, o teste avisa.

## Contacto comercial

Por e-mail, em `comercial@eveni.ao` (escolhido pelo Adriano a 23/10/2026). Aparece junto aos planos e no rodapé. O Adriano tem de criar esta caixa de correio, ou um reencaminhamento para o seu e-mail.
