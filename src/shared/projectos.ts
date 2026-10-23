// Tipos das respostas da API de projectos, partilhados entre o servidor e os ecrãs.
import type { CodigoPlano } from './esquemas.js';
import type { AvisoPrazo } from './materializacao.js';

// Projectos por plano, contando todos os do espaço, de sempre, incluindo os arquivados: o limite do Singular
// é para sempre e mudar de plano não o renova (decisões 026 e 027). null = ilimitados (decisão 003).
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
// owner = dono do espaço de trabalho (acesso a todos os projectos do espaço); editor e viewer = membros
// adicionados ao projecto. O viewer só consulta.
export type PapelNoProjecto = 'owner' | 'editor' | 'viewer';
export const ESTADOS_TAREFA = ['pending', 'in_progress', 'done'] as const;
export type EstadoTarefa = (typeof ESTADOS_TAREFA)[number];

export interface ResumoProjecto {
  id: string;
  nome: string;
  template: string;
  dataEvento: string;
  local: string | null;
  estado: EstadoProjecto;
  tarefas: number;
  concluidas: number;
  // Tarefas críticas por concluir cujo prazo (fim) já passou, no calendário de Luanda.
  criticasEmAtraso: number;
  // O papel de quem está a ver.
  papel: PapelNoProjecto;
}

export interface Pessoa {
  id: string;
  nome: string;
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
  responsavel: Pessoa | null;
  // Por concluir e com o prazo (fim) antes de hoje.
  emAtraso: boolean;
  concluidaEm: string | null;
}

export interface ItemOrcamento {
  id: string;
  categoria: string;
  descricao: string;
  obrigatoria: boolean;
  nota: string | null;
  previstoCentimos: number;
  realCentimos: number;
  // Só o nome: os contactos vêem-se na lista de fornecedores (dono e editores).
  fornecedor: Pessoa | null;
}

export interface Projecto extends ResumoProjecto {
  nomeTemplate: string;
  versaoTemplate: string;
  criadoEm: string;
  // O dia de hoje em Luanda, segundo o servidor (para os ecrãs não dependerem do relógio do telemóvel).
  hoje: string;
  // Quem tem acesso ao projecto. Só donos e editores podem ser responsáveis por tarefas.
  membros: (Pessoa & { papel: PapelNoProjecto })[];
  // Quem está a ver é dono do espaço de trabalho (pode arquivar e restaurar, e dar acessos).
  podeArquivar: boolean;
  // Só para o dono: membros da equipa sem acesso a este projecto, a quem o pode dar. Só nomes.
  semAcesso: Pessoa[];
  tarefasDoProjecto: TarefaProjecto[];
  orcamento: ItemOrcamento[];
  // Número de convidados (a lista vê-se noutro ecrã).
  totalConvidados: number;
  // Contingência do orçamento, em percentagem do subtotal previsto (decisão 019).
  contingencia: number;
}
