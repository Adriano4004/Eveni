// Fornecedores do espaço de trabalho (decisão 019): tipos da API, partilhados entre o servidor e os ecrãs.

// Travão contra abusos, não um limite de plano.
export const MAX_FORNECEDORES_POR_ESPACO = 1000;

export interface Fornecedor {
  id: string;
  nome: string;
  // Uma das categorias do orçamento.
  categoria: string;
  // +<indicativo><número>, ex.: +244923456789.
  telemovel: string | null;
  email: string | null;
  notas: string | null;
  // Média das avaliações (1 a 5, com uma casa decimal) e quantas há. null = ainda sem avaliações.
  media: number | null;
  avaliacoes: number;
}

export interface Avaliacao {
  estrelas: number;
  comentario: string | null;
}

// Histórico de um fornecedor: uma avaliação por evento.
export interface AvaliacaoNoHistorico extends Avaliacao {
  projecto: string;
  dataEvento: string;
  avaliadaEm: string;
}

// Avaliações de um projecto: os fornecedores escolhidos nas rubricas, cada um com a avaliação (se já houver).
export interface AvaliacoesProjecto {
  // A partir do dia do evento (calendário de Luanda).
  aberta: boolean;
  dataEvento: string;
  fornecedores: (Pick<Fornecedor, 'id' | 'nome' | 'categoria'> & { avaliacao: Avaliacao | null })[];
}

// Média com uma casa decimal, para mostrar: 4,3.
export function formatarMedia(media: number): string {
  return media.toFixed(1).replace('.', ',');
}
