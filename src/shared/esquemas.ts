// Esquemas de validação partilhados entre o servidor e os ecrãs (uma só fonte de verdade).
import { z } from 'zod';
import { mensagens } from './mensagens.js';
import { ePalavraPasseComum } from './palavras-passe-comuns.js';

const m = mensagens.validacao;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const email = z
  .string({ error: m.emailInvalido })
  .trim()
  .max(254, m.emailInvalido)
  .pipe(z.email({ error: m.emailInvalido }))
  .transform(normalizarEmail);

// Limite máximo para evitar que palavras-passe enormes sobrecarreguem o servidor.
export const palavraPasseNova = z
  .string({ error: m.palavraPasseObrigatoria })
  .min(10, m.palavraPasseCurta)
  .max(200, m.palavraPasseLonga)
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), m.palavraPasseFraca)
  .refine((v) => !ePalavraPasseComum(v), m.palavraPasseComum);

export const registo = z.object({
  nome: z
    .string({ error: m.nomeObrigatorio })
    .trim()
    .min(1, m.nomeObrigatorio)
    .max(120, m.nomeLongo)
    // Sem quebras de linha nem caracteres de controlo: o nome aparece em ecrãs, PDF e notificações.
    .refine((v) => !/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(v), m.nomeInvalido),
  email,
  palavraPasse: palavraPasseNova,
});
export type Registo = z.infer<typeof registo>;

export const entrar = z.object({
  email,
  palavraPasse: z.string({ error: m.palavraPasseObrigatoria }).min(1, m.palavraPasseObrigatoria).max(200, m.palavraPasseLonga),
});
export type Entrar = z.infer<typeof entrar>;

export type CodigoPlano = 'singular' | 'empresarial' | 'grandes';

// Resposta de GET /api/auth/eu. Nunca inclui hashes, tokens ou segredos.
export interface Eu {
  id: string;
  nome: string;
  email: string;
  emailConfirmado: boolean;
  espaco: { id: string; nome: string; plano: CodigoPlano };
}
