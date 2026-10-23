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

## Escolhas de desenho

- **Cores:**
  - o roxo da marca (#6553F3);
  - um roxo-tinta muito escuro (#1B1540) para texto e para a contagem;
  - amarelo-girassol (#FFC93C) para o dia D e para o botão final.
- **Letra:** a do sistema (rápida em redes lentas e telemóveis de gama média, como o resto da aplicação). Os títulos são muito grossos e inclinados, como o logótipo.
- **Telemóvel primeiro:** tudo numa coluna; no computador, a abertura e as notas passam a colunas.
- **Sem ligações externas:** sem fontes nem imagens de fora, por isso as regras de segurança da página ficam iguais.

## Salvaguardas

Um teste confirma que os números dos templates na página (horizonte e tarefas) batem certo com os templates, que as notas citadas são exactamente as do Excel e que os preços são os da decisão 003. Se um template mudar, o teste avisa.

## Em aberto

"Para mudar de plano, fale connosco": falta um contacto comercial (WhatsApp ou e-mail) para pôr na página.
