// Todos os textos da interface e das respostas da API, num só sítio, para revisão fácil.
// Português europeu, ortografia pré-Acordo de 1990 (ver CLAUDE.md, secção 2).

export const mensagens = {
  app: {
    nome: 'Eveni',
    slogan: 'Gestão de eventos',
  },
  health: {
    servicoIndisponivel: 'Serviço temporariamente indisponível.',
  },
  erros: {
    naoEncontrado: 'Página não encontrada.',
    pedidoInvalido: 'O pedido não é válido.',
    demasiadosPedidos: 'Demasiados pedidos. Aguarde um pouco e tente novamente.',
    interno: 'Ocorreu um erro inesperado. Tente novamente dentro de momentos.',
    origemInvalida: 'Pedido recusado por motivos de segurança. Recarregue a página e tente novamente.',
    semLigacao: 'Sem ligação ao servidor. Verifique a internet e tente novamente.',
  },
  validacao: {
    nomeObrigatorio: 'Indique o seu nome.',
    nomeLongo: 'O nome é demasiado longo.',
    emailInvalido: 'Indique um e-mail válido.',
    palavraPasseCurta: 'A palavra-passe tem de ter pelo menos 10 caracteres.',
    palavraPasseLonga: 'A palavra-passe é demasiado longa.',
    palavraPasseFraca: 'A palavra-passe tem de ter letras e números.',
    palavraPasseComum: 'Esta palavra-passe é demasiado comum. Escolha outra.',
    palavraPasseObrigatoria: 'Indique a palavra-passe.',
  },
  contas: {
    emailJaRegistado: 'Já existe uma conta com este e-mail. Entre com a sua palavra-passe.',
    credenciaisInvalidas: 'E-mail ou palavra-passe incorrectos.',
    contaBloqueada: 'Demasiadas tentativas falhadas. Por segurança, aguarde uma hora antes de tentar de novo.',
    sessaoNecessaria: 'Tem de entrar na sua conta para continuar.',
    nomeEspacoPessoal: (nome: string) => `Espaço de ${nome}`,
  },
  ecras: {
    entrar: {
      titulo: 'Entrar no Eveni',
      email: 'E-mail',
      palavraPasse: 'Palavra-passe',
      botao: 'Entrar',
      aEnviar: 'A entrar…',
      semConta: 'Ainda não tem conta?',
      ligacaoRegisto: 'Criar conta',
    },
    registo: {
      titulo: 'Criar conta',
      subtitulo: 'Comece a planear os seus eventos.',
      nome: 'Nome',
      email: 'E-mail',
      palavraPasse: 'Palavra-passe',
      ajudaPalavraPasse: 'Pelo menos 10 caracteres, com letras e números.',
      botao: 'Criar conta',
      aEnviar: 'A criar conta…',
      jaTemConta: 'Já tem conta?',
      ligacaoEntrar: 'Entrar',
    },
    inicio: {
      ola: (nome: string) => `Olá, ${nome}`,
      emConstrucao: 'Estamos a preparar o resto do Eveni. Em breve poderá criar e acompanhar os seus eventos a partir daqui.',
      espaco: 'Espaço de trabalho',
      plano: 'Plano',
      sair: 'Terminar sessão',
      sairDeTodos: 'Terminar sessão em todos os dispositivos',
      confirmarSairDeTodos: 'Vai terminar a sessão em todos os dispositivos, incluindo este. Continuar?',
      aSair: 'A terminar sessão…',
      erroSair: 'Não foi possível terminar a sessão. Verifique a internet e tente novamente.',
    },
    carregar: 'A carregar…',
  },
  planos: {
    singular: 'Singular',
    empresarial: 'Empresarial',
    grandes: 'Grandes',
  },
} as const;
