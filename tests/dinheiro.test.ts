import { describe, expect, it } from 'vitest';
import { formatarKz } from '../src/shared/dinheiro.js';

const N = ' ';

describe('formatar Kwanza', () => {
  it.each([
    [0, `0,00${N}Kz`],
    [5, `0,05${N}Kz`],
    [100, `1,00${N}Kz`],
    [99_999, `999,99${N}Kz`],
    [100_000, `1${N}000,00${N}Kz`],
    [500_000_000, `5${N}000${N}000,00${N}Kz`],
    [-123_456, `-1${N}234,56${N}Kz`],
  ])('%i cêntimos → %s', (centimos, texto) => {
    expect(formatarKz(centimos)).toBe(texto);
  });

  it('recusa valores que não são cêntimos inteiros', () => {
    expect(() => formatarKz(1.5)).toThrow();
    expect(() => formatarKz(Number.NaN)).toThrow();
  });
});
