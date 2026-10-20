// Esquemas de validação partilhados entre o servidor e os ecrãs (uma só fonte de verdade).
import { z } from 'zod';
import { MAX_ACOMPANHANTES, MAX_LINHAS_IMPORTACAO, normalizarTelemovel, RESPOSTAS } from './convidados.js';
import { dataValida } from './datas.js';
import { mensagens } from './mensagens.js';
import { ESTADOS_TAREFA } from './projectos.js';
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

// Texto de uma linha. Sem quebras de linha nem caracteres de controlo: aparece em ecrãs, PDF e notificações.
const textoDeUmaLinha = (max: number, erros: { obrigatorio: string; longo: string; invalido: string }) =>
  z
    .string({ error: erros.obrigatorio })
    .trim()
    .min(1, erros.obrigatorio)
    .max(max, erros.longo)
    .refine((v) => !/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(v), erros.invalido);

export const registo = z.object({
  nome: textoDeUmaLinha(120, { obrigatorio: m.nomeObrigatorio, longo: m.nomeLongo, invalido: m.nomeInvalido }),
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

// Projectos. A data do evento ser hoje ou futura (no calendário de Luanda) verifica-se no servidor.
const codigoTemplate = z.string({ error: m.templateInvalido }).regex(/^T\d{2}$/, m.templateInvalido);
const dataEvento = z.string({ error: m.dataEventoInvalida }).refine(dataValida, m.dataEventoInvalida);

export const previsaoProjecto = z.object({ template: codigoTemplate, dataEvento });

export const criarProjecto = z.object({
  template: codigoTemplate,
  nome: textoDeUmaLinha(120, { obrigatorio: m.nomeProjectoObrigatorio, longo: m.nomeProjectoLongo, invalido: m.nomeProjectoInvalido }),
  dataEvento,
  // Opcional: vazio conta como não indicado.
  local: z
    .string()
    .trim()
    .max(200, m.localLongo)
    .refine((v) => !/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(v), m.localInvalido)
    .optional()
    .transform((v) => (v ? v : undefined)),
  // A pessoa leu os avisos de tarefas críticas sem tempo (obrigatório quando os há).
  aceitarAvisos: z.boolean().optional(),
});
export type CriarProjecto = z.infer<typeof criarProjecto>;

// Alterar uma tarefa: o estado, o responsável (null = ninguém), ou os dois.
export const actualizarTarefa = z
  .object({
    estado: z.enum(ESTADOS_TAREFA, { error: m.estadoTarefaInvalido }).optional(),
    responsavelId: z.uuid({ error: m.responsavelInvalido }).nullable().optional(),
  })
  .refine((d) => d.estado !== undefined || d.responsavelId !== undefined, { message: mensagens.erros.pedidoInvalido, path: ['estado'] });

// Equipa e convites.
export const convidar = z.object({ email });
export const tokenConvite = z.object({ token: z.string().min(1).max(100) });

// Dar ou mudar o acesso de um membro da equipa a um projecto.
export const darAcesso = z.object({
  utilizadorId: z.uuid({ error: m.membroInvalido }),
  papel: z.enum(['editor', 'viewer'], { error: m.papelInvalido }),
});

// Convidados (decisão 018). Telemóvel e e-mail opcionais: vazio conta como não indicado.
const telemovelOpcional = z
  .string({ error: m.telemovelInvalido })
  .trim()
  .max(30, m.telemovelInvalido)
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const normalizado = normalizarTelemovel(v);
    if (!normalizado) {
      ctx.addIssue({ code: 'custom', message: m.telemovelInvalido });
      return z.NEVER;
    }
    return normalizado;
  });

const emailOpcional = z
  .string({ error: m.emailInvalido })
  .trim()
  .optional()
  .transform((v) => v || null)
  .pipe(email.nullable());

// Número de acompanhantes: vem como número (API) ou texto (formulários, colagem). Vazio = 0.
const numeroAcompanhantes = z
  .union([z.number(), z.string().trim()], { error: m.acompanhantesInvalidos })
  .transform((v) => (v === '' ? 0 : Number(v)))
  .pipe(z.number({ error: m.acompanhantesInvalidos }).int(m.acompanhantesInvalidos).min(0, m.acompanhantesInvalidos).max(MAX_ACOMPANHANTES, m.acompanhantesInvalidos));

export const dadosConvidado = z.object({
  nome: textoDeUmaLinha(120, { obrigatorio: m.nomeConvidadoObrigatorio, longo: m.nomeConvidadoLongo, invalido: m.nomeConvidadoInvalido }),
  telemovel: telemovelOpcional,
  email: emailOpcional,
  acompanhantes: numeroAcompanhantes.optional().transform((v) => v ?? 0),
});
export type DadosConvidado = z.infer<typeof dadosConvidado>;

// Alterar um convidado: os dados e, opcionalmente, a resposta marcada à mão pelo organizador
// (ex.: respondeu por telefone). Só quem vai tem acompanhantes confirmados, nunca mais do que os permitidos:
// o servidor acerta os confirmados (ex.: o organizador reduz os permitidos depois da resposta), sem dar erro.
export const actualizarConvidado = dadosConvidado.extend({
  resposta: z.enum(RESPOSTAS, { error: m.respostaInvalida }).optional(),
  acompanhantesConfirmados: numeroAcompanhantes.optional(),
});

// Importação: as linhas lidas da colagem (lerColagem), ainda por validar. Cada uma é validada no servidor
// com dadosConvidado. Os limites de tamanho só travam pedidos absurdos.
export const importarConvidados = z.object({
  linhas: z
    .array(
      z.object({
        linha: z.number().int().min(1).max(1_000_000),
        nome: z.string().max(1000),
        telemovel: z.string().max(1000),
        email: z.string().max(1000),
        acompanhantes: z.string().max(1000),
      }),
      { error: mensagens.convidados.importacaoVazia },
    )
    .min(1, mensagens.convidados.importacaoVazia)
    .max(MAX_LINHAS_IMPORTACAO, mensagens.convidados.importacaoGrande(MAX_LINHAS_IMPORTACAO)),
});
