import type { z } from 'zod';
import { mensagens } from '../shared/mensagens.js';

// Erro com mensagem já pensada para o utilizador (pt-PT, sem detalhes internos).
export class ErroHttp extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    // Erros por campo do formulário, ex.: { email: 'Indique um e-mail válido.' }.
    public readonly campos?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ErroHttp';
  }
}

// Valida o corpo de um pedido; em caso de erro devolve 400 com a primeira mensagem de cada campo.
export function validar<T extends z.ZodType>(esquema: T, dados: unknown): z.infer<T> {
  const resultado = esquema.safeParse(dados ?? {});
  if (resultado.success) return resultado.data;
  const campos: Record<string, string> = {};
  for (const problema of resultado.error.issues) {
    const campo = String(problema.path[0] ?? '_');
    campos[campo] ??= problema.message;
  }
  throw new ErroHttp(400, mensagens.erros.pedidoInvalido, campos);
}
