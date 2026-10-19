// Todos os textos da interface e das respostas da API, num só sítio, para revisão fácil.
// Português europeu, ortografia pré-Acordo de 1990 (ver CLAUDE.md, secção 2).

export const mensagens = {
  app: {
    nome: 'Eveni',
    slogan: 'Gestão de eventos',
    emConstrucao: 'Estamos a preparar a nova versão do Eveni.',
    emConstrucaoDetalhe: 'Em breve poderá criar e acompanhar os seus eventos a partir daqui.',
  },
  health: {
    servicoIndisponivel: 'Serviço temporariamente indisponível.',
  },
  erros: {
    naoEncontrado: 'Página não encontrada.',
    pedidoInvalido: 'O pedido não é válido.',
    demasiadosPedidos: 'Demasiados pedidos. Aguarde um pouco e tente novamente.',
    interno: 'Ocorreu um erro inesperado. Tente novamente dentro de momentos.',
  },
} as const;
