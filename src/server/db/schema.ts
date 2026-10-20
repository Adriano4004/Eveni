// Esquema da base de dados (Drizzle).
// Depois de alterar este ficheiro: npm run db:generate, rever a migração criada em drizzle/
// e escrever o ficheiro de reversão correspondente em drizzle/reverter/.
import { sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, check, date, index, inet, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
    // 2FA: segredo cifrado (ver seguranca/cifra.ts). O "pendente" existe entre gerar o código QR e
    // confirmar o primeiro código; só passa a totp_secret quando a pessoa prova que o configurou.
    totpSecret: text('totp_secret'),
    totpPendingSecret: text('totp_pending_secret'),
    totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
    // Último passo de 30 s já usado: o mesmo código não serve duas vezes.
    totpLastStep: bigint('totp_last_step', { mode: 'number' }),
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

// Ligações de uso único enviadas por e-mail (confirmação de e-mail; mais tarde, recuperação de palavra-passe).
// Guarda-se só o hash do token, como nas sessões.
export const emailTokens = pgTable(
  'email_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    createdAt: criadoEm(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [
    index('email_tokens_utilizador').on(t.userId, t.purpose),
    check('email_tokens_finalidade_valida', sql`${t.purpose} in ('confirmar_email', 'recuperar_palavra_passe')`),
  ],
);

// Códigos de recuperação do 2FA: uso único, guardados só em hash.
export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: criadoEm(),
  },
  (t) => [uniqueIndex('recovery_codes_unico').on(t.userId, t.codeHash)],
);

// Entrada a meio: palavra-passe certa, falta o código do 2FA. Válida por poucos minutos.
export const loginChallenges = pgTable(
  'login_challenges',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: criadoEm(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('login_challenges_utilizador').on(t.userId)],
);

// Projecto (evento). Pertence a um espaço de trabalho: o acesso verifica-se sempre através dele.
// Não há eliminação pelo utilizador, só arquivo; arquivados continuam a contar para o limite do plano.
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // Template e versão com que foi criado: alterar o template depois não muda o projecto.
    templateCode: text('template_code').notNull(),
    templateVersion: text('template_version').notNull(),
    name: text('name').notNull(),
    // Dia do evento (calendário de Luanda), não um instante.
    eventDate: date('event_date', { mode: 'string' }).notNull(),
    location: text('location'),
    status: text('status').notNull().default('active'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: criadoEm(),
  },
  (t) => [
    index('projects_espaco').on(t.workspaceId, t.createdAt),
    check('projects_estado_valido', sql`${t.status} in ('active', 'archived')`),
  ],
);

// Tarefas materializadas a partir do template: copiadas (não referenciadas), com datas reais.
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // ID estável do template (ex.: T01-022).
    templateTaskId: text('template_task_id').notNull(),
    position: integer('position').notNull(),
    phase: text('phase').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    role: text('role').notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    critical: boolean('critical').notNull(),
    // Encurtada pela regra de compressão ao criar o projecto.
    compressed: boolean('compressed').notNull().default(false),
    note: text('note'),
    status: text('status').notNull().default('pending'),
    // Responsável: uma pessoa real, membro do espaço de trabalho do projecto (não texto livre).
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: criadoEm(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tasks_template_unica').on(t.projectId, t.templateTaskId),
    index('tasks_responsavel').on(t.assigneeId),
    check('tasks_estado_valido', sql`${t.status} in ('pending', 'in_progress', 'done')`),
    check('tasks_datas_validas', sql`${t.endDate} >= ${t.startDate}`),
  ],
);

// Itens de orçamento. Valores em cêntimos de Kwanza (inteiros, nunca float).
export const budgetItems = pgTable(
  'budget_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    required: boolean('required').notNull().default(false),
    note: text('note'),
    plannedCents: bigint('planned_cents', { mode: 'number' }).notNull().default(0),
    actualCents: bigint('actual_cents', { mode: 'number' }).notNull().default(0),
    createdAt: criadoEm(),
  },
  (t) => [
    index('budget_items_projecto').on(t.projectId),
    check('budget_items_valores_positivos', sql`${t.plannedCents} >= 0 and ${t.actualCents} >= 0`),
  ],
);

// Pessoas com acesso a um projecto, além do dono do espaço (que tem sempre acesso a todos).
// Membros do espaço sem linha aqui não vêem o projecto (decisão 017).
export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: criadoEm(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index('project_members_utilizador').on(t.userId),
    check('project_members_papel_valido', sql`${t.role} in ('editor', 'viewer')`),
  ],
);

// Convites para a equipa de um espaço de trabalho (decisão 017). O link leva o token; aqui guarda-se só
// o hash. Uso único, válido 7 dias, revogável; só serve à conta com o e-mail convidado, já confirmado.
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // Sempre em minúsculas (ver normalizarEmail). Dado de terceiro: só o necessário.
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: criadoEm(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('invitations_token_unico').on(t.tokenHash),
    index('invitations_espaco').on(t.workspaceId),
    index('invitations_email').on(t.email),
    check('invitations_email_minusculas', sql`${t.email} = lower(${t.email})`),
  ],
);
