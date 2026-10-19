// Esquema da base de dados (Drizzle).
// Depois de alterar este ficheiro: npm run db:generate, rever a migração criada em drizzle/
// e escrever o ficheiro de reversão correspondente em drizzle/reverter/.
import { sql } from 'drizzle-orm';
import { bigserial, check, index, inet, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const criadoEm = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Guardado sempre em minúsculas (ver normalizarEmail).
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: criadoEm(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_unico').on(t.email), check('users_email_minusculas', sql`${t.email} = lower(${t.email})`)],
);

// O espaço de trabalho tem o plano, os membros e (mais tarde) os projectos.
export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    planCode: text('plan_code').notNull().default('singular'),
    planStartedAt: timestamp('plan_started_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: criadoEm(),
  },
  (t) => [check('workspaces_plano_valido', sql`${t.planCode} in ('singular', 'empresarial', 'grandes')`)],
);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: criadoEm(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('workspace_members_utilizador').on(t.userId),
    check('workspace_members_papel_valido', sql`${t.role} in ('owner', 'member')`),
  ],
);

// Sessões no servidor: apagar a linha termina a sessão de imediato.
// O cookie leva o token; aqui guarda-se só o seu hash (SHA-256), nunca o token.
export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: criadoEm(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_utilizador').on(t.userId), index('sessions_expiracao').on(t.expiresAt)],
);

// Limitação de pedidos guardada na base de dados, para funcionar com várias instâncias.
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
});

// Registo de auditoria das acções sensíveis.
// user_id fica a NULL quando a conta é eliminada: o registo mantém-se, sem identificar a pessoa.
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    ip: inet('ip'),
    details: jsonb('details').notNull().default({}),
    createdAt: criadoEm(),
  },
  (t) => [index('audit_log_utilizador').on(t.userId), index('audit_log_data').on(t.createdAt)],
);
