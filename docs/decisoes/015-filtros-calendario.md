# 015 — Filtros e calendário das tarefas

**Data:** 20/10/2026 · **Estado:** Em vigor (Fase 3, segundo PR)

## Filtros

- Filtra-se por **fase**, **categoria**, **papel**, **estado** e **responsável**. No responsável, também se pode escolher "Atribuídas a mim" ou "Sem responsável".
- Há também duas opções rápidas: **Só críticas** e **Só em atraso**.
- Os filtros juntam-se uns aos outros. Por exemplo: críticas + por fazer + Pós Produção.
- Os filtros ficam escondidos numa secção que se abre com um toque, para não ocupar o ecrã do telemóvel.
- Com filtros activos, o ecrã mostra quantos estão ligados ("Filtros (2)") e quantas tarefas aparecem ("A mostrar 20 de 47 tarefas"). Um botão limpa tudo de uma vez.
- Os filtros funcionam no próprio telemóvel, sobre as tarefas já carregadas: não fazem pedidos novos ao servidor, o que conta numa rede lenta.
- Não ficam guardados: ao sair do projecto, voltam ao início.

## Calendário

- Mostra o mês, de segunda a domingo. Em cada dia aparece o número de tarefas a decorrer: tarefas com início e fim diferentes contam em todos os dias entre um e outro. O número fica a vermelho se alguma dessas tarefas estiver em atraso.
- **Hoje** tem contorno violeta e o **dia do evento** está preenchido a violeta.
- Ao tocar num dia, aparecem as tarefas desse dia por baixo. Podem ser concluídas ou atribuídas ali mesmo.
- Abre no mês de hoje, se o projecto passar por ele, ou então no primeiro mês com tarefas. Só se pode andar pelos meses que o projecto ocupa.
- Os filtros também se aplicam ao calendário. Por exemplo, "Atribuídas a mim" no calendário mostra a agenda de cada pessoa.

As funções dos filtros e do calendário estão em `src/shared/vistas.ts`, testadas à parte. Os testes incluem anos bissextos, meses que começam à segunda-feira e a passagem de ano.
