// Tipos das respostas da API de projectos, partilhados entre o servidor e os ecrãs.
import type { CodigoPlano } from './esquemas.js';
import type { AvisoPrazo } from './materializacao.js';

// Projectos por plano, contados desde o início do período do plano, incluindo os arquivados.
// null = ilimitados (docs/decisoes/003-planos.md).
export const LIMITE_PROJECTOS: Record<CodigoPlano, number | null> = {
  singular: 1,
  empresarial: null,
  grandes: null,
};

// A data do evento pode estar, no máximo, a 5 anos de hoje.
export const DIAS_MAXIMOS_ATE_EVENTO = 5 * 365;

export interface ResumoTemplate {
  codigo: string;
  nome: string;
  descricao: string;
  diasNecessarios: number;
  tarefas: number;
  criticas: number;
}

export interface Previsao {
  diasDisponiveis: number;
  diasNecessarios: number;
  comprimido: boolean;
  avisos: AvisoPrazo[];
}

export type EstadoProjecto = 'active' | 'archived';
export type EstadoTarefa = 'pending' | 'in_progress' | 'done';

export interface ResumoProjecto {
  id: string;
  nome: string;
  template: string;
  dataEvento: string;
  local: string | null;
  estado: EstadoProjecto;
  tarefas: number;
  concluidas: number;
}

export interface TarefaProjecto {
  id: string;
  idTemplate: string;
  fase: string;
  categoria: string;
  titulo: string;
  papel: string;
  inicio: string;
  fim: string;
  critica: boolean;
  comprimida: boolean;
  nota: string | null;
  estado: EstadoTarefa;
}

export interface ItemOrcamento {
  id: string;
  categoria: string;
  descricao: string;
  obrigatoria: boolean;
  nota: string | null;
  previstoCentimos: number;
  realCentimos: number;
}

export interface Projecto extends ResumoProjecto {
  nomeTemplate: string;
  versaoTemplate: string;
  criadoEm: string;
  tarefasDoProjecto: TarefaProjecto[];
  orcamento: ItemOrcamento[];
}
