import { describe, expect, it } from 'vitest';
import { criarCifra } from '../src/server/seguranca/cifra.js';
import { base32, codigoHotp, deBase32, gerarSegredo, verificarTotp } from '../src/server/seguranca/totp.js';

// Segredo e resultados da RFC 6238, anexo B (SHA1), truncados a 6 dígitos.
const SEGREDO_RFC = Buffer.from('12345678901234567890');
const SEGREDO_RFC_B32 = base32(SEGREDO_RFC);

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])('vector de teste da norma: t=%i → %s', (segundos, codigo) => {
    expect(codigoHotp(SEGREDO_RFC, Math.floor(segundos / 30))).toBe(codigo);
  });

  it('base32 ida e volta', () => {
    expect(deBase32(SEGREDO_RFC_B32).equals(SEGREDO_RFC)).toBe(true);
    expect(SEGREDO_RFC_B32).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('aceita o código actual e os vizinhos (relógio desacertado), e mais nenhum', () => {
    const agora = 1111111111 * 1000;
    expect(verificarTotp(SEGREDO_RFC_B32, '050471', null, agora)).not.toBeNull();
    const passo = Math.floor(1111111111 / 30);
    expect(verificarTotp(SEGREDO_RFC_B32, codigoHotp(SEGREDO_RFC, passo - 1), null, agora)).toBe(passo - 1);
    expect(verificarTotp(SEGREDO_RFC_B32, codigoHotp(SEGREDO_RFC, passo + 1), null, agora)).toBe(passo + 1);
    expect(verificarTotp(SEGREDO_RFC_B32, codigoHotp(SEGREDO_RFC, passo - 2), null, agora)).toBeNull();
    expect(verificarTotp(SEGREDO_RFC_B32, codigoHotp(SEGREDO_RFC, passo + 2), null, agora)).toBeNull();
  });

  it('o mesmo código não serve duas vezes', () => {
    const agora = 1111111111 * 1000;
    const usado = verificarTotp(SEGREDO_RFC_B32, '050471', null, agora)!;
    expect(verificarTotp(SEGREDO_RFC_B32, '050471', usado, agora)).toBeNull();
  });

  it.each(['', '12345', '1234567', 'abcdef', '12 345'])('recusa formatos inválidos (%s)', (codigo) => {
    expect(verificarTotp(SEGREDO_RFC_B32, codigo, null)).toBeNull();
  });

  it('gera segredos de 160 bits diferentes', () => {
    const a = gerarSegredo();
    expect(deBase32(a)).toHaveLength(20);
    expect(a).not.toBe(gerarSegredo());
  });
});

describe('cifra', () => {
  const cifra = criarCifra('x'.repeat(32), 'totp');

  it('cifra e decifra; o texto cifrado não contém o original e muda a cada vez', () => {
    const c1 = cifra.cifrar('SEGREDO');
    expect(c1).not.toContain('SEGREDO');
    expect(c1).not.toBe(cifra.cifrar('SEGREDO'));
    expect(cifra.decifrar(c1)).toBe('SEGREDO');
  });

  it('não decifra com outra chave nem com dados alterados', () => {
    const c1 = cifra.cifrar('SEGREDO');
    expect(() => criarCifra('y'.repeat(32), 'totp').decifrar(c1)).toThrow();
    const partes = c1.split('.');
    partes[3] = Buffer.from('outra coisa').toString('base64url');
    expect(() => cifra.decifrar(partes.join('.'))).toThrow();
  });
});
