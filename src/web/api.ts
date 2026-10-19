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

// Pedido à API do Eveni. Lança ErroApi com a mensagem do servidor (já em português).
export async function api<T>(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown): Promise<T> {
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
  if (resposta.status === 204) return undefined as T;
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new ErroApi(resposta.status, dados.mensagem ?? mensagens.erros.interno, dados.campos ?? {});
  }
  return dados as T;
}
