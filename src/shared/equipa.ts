// Tipos da API da equipa do espaço de trabalho e dos convites (decisão 017).
import type { CodigoPlano } from './esquemas.js';

// Pessoas no espaço por plano, contando com o dono e com os convites por aceitar. null = sem limite.
// O plano Singular não tem colaboração: só o dono.
export const LIMITE_PESSOAS: Record<CodigoPlano, number | null> = {
  singular: 1,
  empresarial: 10,
  grandes: null,
};

export const DIAS_VALIDADE_CONVITE = 7;

export interface MembroEquipa {
  id: string;
  nome: string;
  email: string;
  papel: 'owner' | 'member';
  desde: string;
}

export interface ConvitePendente {
  id: string;
  email: string;
  criadoEm: string;
  expiraEm: string;
}

// Só para o dono do espaço: inclui e-mails.
export interface Equipa {
  espaco: string;
  plano: CodigoPlano;
  limite: number | null;
  // Membros mais convites por aceitar.
  ocupados: number;
  membros: MembroEquipa[];
  convites: ConvitePendente[];
}

// Resposta a criar um convite. A ligação só aparece aqui, uma vez.
export interface ConviteCriado extends ConvitePendente {
  ligacao: string;
}

// O que quem abre a ligação vê antes de aceitar.
export interface InfoConvite {
  espaco: string;
  convidadoPor: string;
  // Parcialmente escondido (ex.: a***@exemplo.ao).
  email: string;
  expiraEm: string;
}

export type AccaoRegisto =
  | 'projecto.criado'
  | 'projecto.arquivado'
  | 'projecto.restaurado'
  | 'projecto.acesso_dado'
  | 'projecto.acesso_retirado'
  | 'projecto.relatorio'
  | 'equipa.convite_criado'
  | 'equipa.convite_revogado'
  | 'equipa.convite_aceite'
  | 'equipa.membro_removido';

// Uma linha do registo de actividade do espaço (só o dono o vê). Os nomes são os actuais; null quando a conta,
// o projecto ou o convite já não existem.
export interface EntradaRegisto {
  id: number;
  accao: AccaoRegisto;
  data: string;
  quem: string | null;
  projecto: string | null;
  pessoa: string | null;
  email: string | null;
  papel: 'editor' | 'viewer' | null;
  // Nos relatórios: o tipo (cliente, interno, cronograma).
  relatorio: TipoRelatorio | null;
}

export type TipoRelatorio = 'cliente' | 'interno' | 'cronograma';

export interface Registo {
  entradas: EntradaRegisto[];
  // Há entradas mais antigas: pedir com ?antes=<id da última>.
  mais: boolean;
}
