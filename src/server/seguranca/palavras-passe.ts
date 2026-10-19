import { hash, verify } from '@node-rs/argon2';

// Argon2id com os parâmetros por omissão da biblioteca (m=19 MiB, t=2, p=1), os recomendados pela OWASP.

export function gerarHash(palavraPasse: string): Promise<string> {
  return hash(palavraPasse);
}

export async function verificarPalavraPasse(hashGuardado: string, palavraPasse: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, palavraPasse);
  } catch {
    return false;
  }
}

// Hash de uma palavra-passe aleatória, usado quando o e-mail não existe: a verificação demora
// o mesmo tempo, para que a resposta não revele se a conta existe.
let hashFicticio: Promise<string> | undefined;
export function obterHashFicticio(): Promise<string> {
  hashFicticio ??= hash(crypto.randomUUID());
  return hashFicticio;
}
