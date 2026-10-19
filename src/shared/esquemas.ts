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

export const recuperar = z.object({ email });

export const redefinir = z.object({
  token: z.string().min(1).max(100),
  palavraPasse: palavraPasseNova,
});

export const mudarPalavraPasse = z.object({
  palavraPasseActual: z.string({ error: m.palavraPasseObrigatoria }).min(1, m.palavraPasseObrigatoria).max(200, m.palavraPasseLonga),
  palavraPasse: palavraPasseNova,
});

const codigoTotp = z.string({ error: m.codigoInvalido }).trim().regex(/^\d{6}$/, m.codigoInvalido);
const codigoRecuperacao = z
  .string({ error: m.codigoRecuperacaoInvalido })
  .trim()
  .min(10, m.codigoRecuperacaoInvalido)
  .max(20, m.codigoRecuperacaoInvalido);
const palavraPasseActual = z.string({ error: m.palavraPasseObrigatoria }).min(1, m.palavraPasseObrigatoria).max(200, m.palavraPasseLonga);

// Segundo passo da entrada: o código da aplicação ou um código de recuperação.
// Um dos dois campos: o erro aparece junto ao campo que a pessoa preencheu.
export const entrarDoisFactores = z
  .object({ codigo: codigoTotp.optional(), codigoRecuperacao: codigoRecuperacao.optional() })
  .refine((d) => (d.codigo === undefined) !== (d.codigoRecuperacao === undefined), { message: m.codigoInvalido, path: ['codigo'] });

export const activarDoisFactores = z.object({ palavraPasse: palavraPasseActual, codigo: codigoTotp });

// Desactivar ou gerar novos códigos: palavra-passe e um código (da aplicação ou de recuperação).
export const confirmarDoisFactores = z.object({
  palavraPasse: palavraPasseActual,
  codigo: z.string({ error: m.codigoOuRecuperacaoInvalido }).trim().min(6, m.codigoOuRecuperacaoInvalido).max(20, m.codigoOuRecuperacaoInvalido),
});

// Código do 2FA para acções sobre os dados: só obrigatório (e verificado no servidor) quando o 2FA está activo.
const codigoSeActivo = z.string().trim().max(20, m.codigoOuRecuperacaoInvalido).optional().transform((v) => (v ? v : undefined));

export const exportarDados = z.object({ palavraPasse: palavraPasseActual, codigo: codigoSeActivo });

export const eliminarConta = z.object({
  palavraPasse: palavraPasseActual,
  codigo: codigoSeActivo,
  confirmacao: z
    .string({ error: m.escrevaEliminar })
    .trim()
    .refine((v) => v.toUpperCase() === 'ELIMINAR', m.escrevaEliminar),
});

export interface InicioDoisFactores {
  segredo: string;
  qr: string;
}

export type CodigoPlano = 'singular' | 'empresarial' | 'grandes';

// Resposta de GET /api/auth/eu. Nunca inclui hashes, tokens ou segredos.
export interface Eu {
  id: string;
  nome: string;
  email: string;
  emailConfirmado: boolean;
  doisFactores: boolean;
  espaco: { id: string; nome: string; plano: CodigoPlano };
}
