import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// TOTP (RFC 6238): o código de 6 dígitos das aplicações autenticadoras (Google Authenticator, Authy…).
// Implementado aqui para evitar uma dependência; os testes usam os vectores da própria norma.

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PASSO_SEGUNDOS = 30;
const DIGITOS = 6;

export function base32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

export function deBase32(texto: string): Buffer {
  const limpo = texto.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const letra of limpo) {
    const indice = ALFABETO.indexOf(letra);
    if (indice < 0) throw new Error('base32 inválido');
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// 160 bits, o tamanho recomendado para HMAC-SHA1.
export function gerarSegredo(): string {
  return base32(randomBytes(20));
}

export function codigoHotp(segredo: Buffer, contador: number, digitos = DIGITOS): string {
  const mensagem = Buffer.alloc(8);
  mensagem.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac('sha1', segredo).update(mensagem).digest();
  const deslocamento = hmac[hmac.length - 1]! & 0xf;
  const binario = hmac.readUInt32BE(deslocamento) & 0x7fffffff;
  return String(binario % 10 ** digitos).padStart(digitos, '0');
}

export function passoActual(agoraMs = Date.now()): number {
  return Math.floor(agoraMs / 1000 / PASSO_SEGUNDOS);
}

// Verifica o código aceitando um passo antes e um depois (relógios do telemóvel ligeiramente desacertados).
// Devolve o passo que correspondeu, para impedir que o mesmo código seja usado duas vezes.
export function verificarTotp(segredoBase32: string, codigo: string, ultimoPassoUsado: number | null, agoraMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(codigo)) return null;
  const segredo = deBase32(segredoBase32);
  const actual = passoActual(agoraMs);
  for (const passo of [actual - 1, actual, actual + 1]) {
    if (ultimoPassoUsado !== null && passo <= ultimoPassoUsado) continue;
    const esperado = Buffer.from(codigoHotp(segredo, passo));
    if (timingSafeEqual(esperado, Buffer.from(codigo))) return passo;
  }
  return null;
}

export function urlOtpauth(segredoBase32: string, email: string): string {
  const rotulo = encodeURIComponent(`Eveni:${email}`);
  return `otpauth://totp/${rotulo}?secret=${segredoBase32}&issuer=Eveni&algorithm=SHA1&digits=${DIGITOS}&period=${PASSO_SEGUNDOS}`;
}
