// Esquema da base de dados (Drizzle).
// Depois de alterar este ficheiro: npm run db:generate, rever a migração criada em drizzle/
// e escrever o ficheiro de reversão correspondente em drizzle/reverter/.
import { sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, check, customType, date, foreignKey, index, inet, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
    // Espaço de trabalho a que a acção diz respeito (equipa e projectos), para o registo que o dono vê.
    // Apagado com o espaço.
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    ip: inet('ip'),
    details: jsonb('details').notNull().default({}),
    createdAt: criadoEm(),
  },
  (t) => [index('audit_log_utilizador').on(t.userId), index('audit_log_data').on(t.createdAt), index('audit_log_espaco').on(t.workspaceId, t.id)],
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
    // Contingência do orçamento, em percentagem do total previsto (decisão 019). Vem do template
    // ("Contingência (N%)") e pode ser alterada no projecto.
    contingencyPct: integer('contingency_pct').notNull().default(10),
    status: text('status').notNull().default('active'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: criadoEm(),
  },
  (t) => [
    index('projects_espaco').on(t.workspaceId, t.createdAt),
    check('projects_estado_valido', sql`${t.status} in ('active', 'archived')`),
    check('projects_contingencia_valida', sql`${t.contingencyPct} between 0 and 50`),
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

// Fornecedores de um espaço de trabalho (decisão 019): reutilizáveis entre os projectos do espaço.
// Telemóvel no mesmo formato dos convidados (+244…), e-mail em minúsculas.
export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category').notNull(),
    phone: text('phone'),
    email: text('email'),
    notes: text('notes'),
    createdAt: criadoEm(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('suppliers_nome_unico').on(t.workspaceId, sql`lower(${t.name})`),
    check('suppliers_email_minusculas', sql`${t.email} = lower(${t.email})`),
    check('suppliers_telemovel_formato', sql`${t.phone} ~ '^\\+[0-9]{8,15}$'`),
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
    // Fornecedor (do mesmo espaço de trabalho do projecto: verificado no servidor e por um gatilho na base de
    // dados, ver drizzle/0013). Apagar o fornecedor só o tira da rubrica.
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    createdAt: criadoEm(),
  },
  (t) => [
    index('budget_items_projecto').on(t.projectId),
    index('budget_items_fornecedor').on(t.supplierId),
    check('budget_items_valores_positivos', sql`${t.plannedCents} >= 0 and ${t.actualCents} >= 0`),
    check('budget_items_valores_maximos', sql`${t.plannedCents} <= 10000000000000 and ${t.actualCents} <= 10000000000000`),
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

// Mesas de um projecto (decisão 018): nome e lotação. Os convidados sentam-se por mesa, sem lugar numerado.
export const eventTables = pgTable(
  'event_tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    seats: integer('seats').notNull(),
    createdAt: criadoEm(),
  },
  (t) => [
    // Alvo da chave estrangeira composta dos convidados: a mesa tem de ser do mesmo projecto.
    unique('event_tables_projecto_id').on(t.projectId, t.id),
    uniqueIndex('event_tables_nome_unico').on(t.projectId, sql`lower(${t.name})`),
    check('event_tables_lugares_validos', sql`${t.seats} between 1 and 100`),
  ],
);

// Convidados de um projecto (decisão 018). Dados de terceiros: só nome e contactos.
// Telemóvel guardado como +<indicativo><número> (ver normalizarTelemovel), e-mail em minúsculas:
// assim os repetidos detectam-se na base de dados, seja qual for a forma como foram escritos.
export const guests = pgTable(
  'guests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    // Acompanhantes que o organizador permite; e quantos o convidado confirmou.
    plusOnesAllowed: integer('plus_ones_allowed').notNull().default(0),
    response: text('response').notNull().default('pending'),
    plusOnesConfirmed: integer('plus_ones_confirmed').notNull().default(0),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    // Chave da ligação de RSVP deste convidado. A ligação leva a chave e uma assinatura (HMAC) feita com o
    // segredo da aplicação: uma fuga só da base de dados não chega para responder por ninguém.
    // Mudar a chave invalida a ligação antiga (ver convidados/rsvp.ts).
    rsvpKey: uuid('rsvp_key').notNull().defaultRandom(),
    // Mesa (do mesmo projecto: garantido pela chave estrangeira composta). Apagar a mesa só tira o convidado dela.
    tableId: uuid('table_id'),
    createdAt: criadoEm(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('guests_projecto').on(t.projectId, t.name),
    uniqueIndex('guests_chave_rsvp').on(t.rsvpKey),
    index('guests_mesa').on(t.tableId),
    foreignKey({ name: 'guests_mesa_do_projecto', columns: [t.projectId, t.tableId], foreignColumns: [eventTables.projectId, eventTables.id] }).onDelete('set null'),
    uniqueIndex('guests_telemovel_unico').on(t.projectId, t.phone).where(sql`${t.phone} is not null`),
    uniqueIndex('guests_email_unico').on(t.projectId, t.email).where(sql`${t.email} is not null`),
    check('guests_resposta_valida', sql`${t.response} in ('pending', 'yes', 'no')`),
    check('guests_acompanhantes_validos', sql`${t.plusOnesAllowed} between 0 and 10`),
    check('guests_confirmados_validos', sql`${t.plusOnesConfirmed} between 0 and ${t.plusOnesAllowed} and (${t.response} = 'yes' or ${t.plusOnesConfirmed} = 0)`),
    check('guests_email_minusculas', sql`${t.email} = lower(${t.email})`),
    check('guests_telemovel_formato', sql`${t.phone} ~ '^\\+[0-9]{8,15}$'`),
  ],
);

// Avaliação de um fornecedor depois de um evento (decisão 019): de 1 a 5 estrelas e um comentário curto.
// Uma por fornecedor e projecto (pode ser mudada). O fornecedor tem de ser do espaço do projecto (gatilho, 0014).
export const supplierRatings = pgTable(
  'supplier_ratings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    stars: integer('stars').notNull(),
    comment: text('comment'),
    ratedBy: uuid('rated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: criadoEm(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('supplier_ratings_unica').on(t.supplierId, t.projectId),
    index('supplier_ratings_projecto').on(t.projectId),
    check('supplier_ratings_estrelas_validas', sql`${t.stars} between 1 and 5`),
  ],
);

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

// Marca de uma agência nos relatórios PDF (decisão 020): logótipo, cor e rodapé. Só se usa nos planos
// Empresarial e Grandes; no Singular fica guardada, mas os PDF levam a marca do Eveni.
export const workspaceBrands = pgTable(
  'workspace_brands',
  {
    workspaceId: uuid('workspace_id')
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // #rrggbb
    color: text('color'),
    footer: text('footer'),
    // PNG ou JPEG, até 500 KB (verificado no servidor antes de guardar).
    logo: bytea('logo'),
    logoType: text('logo_type'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('workspace_brands_cor_valida', sql`${t.color} ~ '^#[0-9a-f]{6}$'`),
    check('workspace_brands_rodape_curto', sql`char_length(${t.footer}) <= 200`),
    check('workspace_brands_logo_tipo', sql`(${t.logo} is null and ${t.logoType} is null) or (${t.logoType} in ('image/png', 'image/jpeg') and octet_length(${t.logo}) <= 512000)`),
  ],
);
