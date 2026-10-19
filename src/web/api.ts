import { mensagens } from '../shared/mensagens.js';

export class ErroApi extends Error {
  constructor(
    public readonly estado: number,
    message: string,
    public readonly campos: Record<string, string> = {},
  ) {
    super(message);
  }
}

// Faz o pedido e trata as falhas comuns (sem ligação, erro do servidor). Devolve a resposta se correu bem.
async function pedido(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<Response> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      method: metodo,
      credentials: 'same-origin',
      headers: corpo === undefined ? {} : { 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi(0, mensagens.erros.semLigacao);
  }
  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => ({}));
    throw new ErroApi(resposta.status, dados.mensagem ?? mensagens.erros.interno, dados.campos ?? {});
  }
  return resposta;
}

// Pedido à API do Eveni. Lança ErroApi com a mensagem do servidor (já em português).
export async function api<T>(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<T> {
  const resposta = await pedido(metodo, caminho, corpo);
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json().catch(() => ({}))) as T;
}

// Mensagem a mostrar ao utilizador para qualquer falha de um pedido.
export function mensagemDeErro(falha: unknown): string {
  return falha instanceof ErroApi ? falha.message : mensagens.erros.interno;
}

// Pedido cuja resposta é um ficheiro a descarregar (ex.: exportação dos dados).
export async function descarregar(caminho: string, corpo: unknown): Promise<void> {
  const resposta = await pedido('POST', caminho, corpo);
  const nome = /filename="([^"]+)"/.exec(resposta.headers.get('content-disposition') ?? '')?.[1] ?? 'eveni.json';
  const url = URL.createObjectURL(await resposta.blob());
  const ligacao = document.createElement('a');
  ligacao.href = url;
  ligacao.download = nome;
  ligacao.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
