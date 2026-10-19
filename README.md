# Eveni

Gestão de eventos para o mercado angolano. O contexto completo do projecto está em [`CLAUDE.md`](CLAUDE.md) e as decisões em [`docs/decisoes/`](docs/decisoes/).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Arranca o servidor em modo de desenvolvimento |
| `npm run dev:web` | Arranca os ecrãs com recarregamento automático |
| `npm run build` | Compila servidor e ecrãs para `dist/` |
| `npm start` | Arranca a versão compilada (usado pelo Railway) |
| `npm run typecheck` | Verifica os tipos |
| `npm test` | Testes unitários e de integração (precisa de PostgreSQL) |
| `npm run test:e2e` | Testes no browser |
| `npm run db:generate` | Cria uma migração a partir de `src/server/db/schema.ts` |

## Estrutura

```
src/server/   servidor (Fastify), configuração, base de dados
src/web/      ecrãs (React)
src/shared/   código partilhado: textos da interface, esquemas
drizzle/      migrações versionadas
tests/        testes unitários e de integração
e2e/          testes no browser
docs/         decisões e documentação
```
