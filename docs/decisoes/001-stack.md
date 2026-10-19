# 001 — Stack técnica

**Data:** 19/10/2026 · **Estado:** Aprovada pelo Adriano

## Decisão

| Peça | Escolha |
|---|---|
| Linguagem | TypeScript em todo o projecto |
| Servidor | Node.js 22 LTS + Fastify |
| Validação | zod, com esquemas partilhados entre servidor e ecrãs |
| Base de dados | PostgreSQL (serviço do Railway) |
| Migrações | Drizzle, em ficheiros versionados e revistos em PR |
| Ecrãs | React (Vite), servido pelo mesmo serviço; mobile-first |
| Sessões | Guardadas na base de dados (revogáveis de imediato) |
| Testes | Vitest (unitários e integração com PostgreSQL real) + Playwright (browser) |
| CI | GitHub Actions: tipos, testes e auditoria de dependências em cada PR |

## Porquê

- O código vai ser mantido quase só pelo Claude Code; TypeScript e zod apanham erros antes do deploy.
- PostgreSQL dá restrições e transacções mais sólidas do que a MySQL da versão anterior.
- Migrações em ficheiros substituem o antigo `migrate()` que corria a cada arranque.
- Sessões na base de dados resolvem directamente a falha anterior (JWT de 30 dias sem revogação).
- Um só serviço de aplicação + um de base de dados no Railway: menos peças para gerir.
