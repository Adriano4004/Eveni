import { z } from 'zod';

// Validação da configuração no arranque (CLAUDE.md, secção 5, regra 13):
// se faltar uma variável obrigatória, a aplicação recusa arrancar com uma mensagem clara.

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Distingue o staging da produção, que correm ambos com NODE_ENV=production.
    // Obrigatório e sem valor por omissão: um serviço de produção sem APP_ENV não pode
    // escapar às verificações de produção.
    APP_ENV: z.enum(['local', 'staging', 'production'], {
      error: 'APP_ENV em falta ou inválido (local, staging ou production).',
    }),
    PORT: z.coerce.number().int().positive().default(3000),
    // Número de proxies do alojamento à frente da aplicação (Railway: 1). Define que IP conta
    // como o do cliente na limitação de pedidos: valor errado = limites partilhados por todos.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
    DATABASE_URL: z
      .string({ error: 'DATABASE_URL em falta (ligação ao PostgreSQL).' })
      .startsWith('postgres', 'DATABASE_URL tem de começar por postgres:// ou postgresql://'),
    APP_URL: z
      .url({ error: 'APP_URL em falta ou inválido (endereço público da aplicação, ex.: https://eveni.ao).' })
      .refine((v) => !v.endsWith('/'), 'APP_URL não pode terminar com "/".'),
    SESSION_SECRET: z
      .string({ error: 'SESSION_SECRET em falta.' })
      .min(32, 'SESSION_SECRET tem de ter pelo menos 32 caracteres.'),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.APP_ENV !== 'production') return;
    if (!c.RESEND_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'RESEND_API_KEY é obrigatória em produção.' });
    }
    if (!c.EMAIL_FROM) {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_FROM'], message: 'EMAIL_FROM é obrigatório em produção.' });
    }
    if (c.APP_URL && !c.APP_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'APP_URL tem de usar https:// em produção.' });
    }
  });

export type Config = z.infer<typeof esquema>;

export class ConfigInvalida extends Error {
  constructor(public readonly problemas: string[]) {
    super(`Configuração inválida:\n${problemas.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigInvalida';
  }
}

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Variáveis vazias no Railway contam como em falta.
  const limpo = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const resultado = esquema.safeParse(limpo);
  if (!resultado.success) {
    throw new ConfigInvalida(resultado.error.issues.map((i) => i.message));
  }
  return resultado.data;
}
