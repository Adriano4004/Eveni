// Pagamentos por transferência bancária (decisão 029).
import type { CodigoPlano } from './esquemas.js';

export type PlanoPago = Exclude<CodigoPlano, 'singular'>;
export type Periodo = 'monthly' | 'yearly';
export type EstadoPagamento = 'awaiting_proof' | 'pending' | 'confirmed' | 'rejected' | 'cancelled';

export const PLANOS_PAGOS: readonly PlanoPago[] = ['empresarial', 'grandes'];
export const PERIODOS: readonly Periodo[] = ['monthly', 'yearly'];

// Preço por mês, em cêntimos de Kwanza (decisão 003, preços de 23/10/2026).
export const PRECO_MENSAL: Record<PlanoPago, number> = {
  empresarial: 37_000_000,
  grandes: 64_000_000,
};

// No anual, 10% de desconto sobre 12 meses (decidido pelo Adriano a 26/10/2026).
export const DESCONTO_ANUAL_PCT = 10;

export function valorDoPagamento(plano: PlanoPago, periodo: Periodo): number {
  const mensal = PRECO_MENSAL[plano];
  return periodo === 'monthly' ? mensal : (mensal * 12 * (100 - DESCONTO_ANUAL_PCT)) / 100;
}

// Meses de cada período.
export const MESES: Record<Periodo, number> = { monthly: 1, yearly: 12 };

// Fim do período pago (decisão 030, Adriano a 26/10/2026): aviso por e-mail 7 dias antes e no dia; depois do
// fim, 7 dias de tolerância antes de o espaço voltar ao Singular.
export const DIAS_AVISO = 7;
export const DIAS_TOLERANCIA = 7;

// Dia em que um plano que acaba em `fim` volta ao Singular, se não for renovado.
export const descidaDoPlano = (fim: Date) => new Date(fim.getTime() + DIAS_TOLERANCIA * 24 * 60 * 60 * 1000);

// Conta para as transferências. Não são segredos: aparecem a quem paga.
export const CONTA_BANCARIA = {
  titular: 'BLUE BERN Comércio Geral e Prestação de Serviços, Lda.',
  banco: 'Banco Millennium Atlântico',
  conta: '1463 33 33 810001',
  iban: 'AO06 0055 0000 4633 3338 1012 8',
} as const;

// Comprovativo: PDF ou fotografia, até 5 MB.
export const MAX_BYTES_COMPROVATIVO = 5 * 1024 * 1024;

export interface Pagamento {
  id: string;
  referencia: string;
  plano: PlanoPago;
  periodo: Periodo;
  valorCentimos: number;
  estado: EstadoPagamento;
  temComprovativo: boolean;
  motivoRecusa: string | null;
  inicio: string | null;
  fim: string | null;
  criadoEm: string;
  decididoEm: string | null;
}

export interface SituacaoPlano {
  plano: CodigoPlano;
  // Fim do período pago (null: sem fim, como o Singular).
  fim: string | null;
  // Só o dono do espaço pode pedir e pagar.
  podePagar: boolean;
  emAberto: Pagamento | null;
  historico: Pagamento[];
}

export interface PagamentoAdmin extends Pagamento {
  espaco: { id: string; nome: string };
  dono: { nome: string; email: string } | null;
}
