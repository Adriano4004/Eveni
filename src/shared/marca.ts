// Marca da agência nos relatórios PDF (decisão 020). Partilhado entre o servidor e os ecrãs.
import type { CodigoPlano } from './esquemas.js';

export const PLANOS_COM_MARCA: readonly CodigoPlano[] = ['empresarial', 'grandes'];
export const MAX_BYTES_LOGO = 500 * 1024;
export const MAX_RODAPE = 200;

export interface Marca {
  // O plano do espaço inclui marca própria.
  disponivel: boolean;
  // #rrggbb
  cor: string | null;
  rodape: string | null;
  temLogo: boolean;
}
