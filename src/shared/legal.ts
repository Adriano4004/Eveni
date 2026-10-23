// Termos de utilização e política de privacidade (decisão 026). Os textos estão em mensagens.legal.
// Ao mudar o texto de forma que as pessoas devam voltar a aceitar, mudar a versão para a data da nova
// versão: na entrada seguinte, cada conta tem de aceitar antes de continuar.
export const VERSAO_TERMOS = '2026-10-23';

export interface SeccaoLegal {
  titulo: string;
  paragrafos: readonly string[];
}
