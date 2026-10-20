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
}
