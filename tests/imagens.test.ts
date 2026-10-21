// Verificação estrutural dos logótipos (imagens feitas de propósito para bloquear ou derrubar o servidor).
import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { jpegValido, pngValido } from '../src/server/relatorios/imagens.js';
import { imagemValida } from '../src/server/relatorios/pdf.js';
import { cabecalho, criarDocumento, terminar } from '../src/server/relatorios/pdf.js';

const PNG = readFileSync('tests/imagens/logo.png');
const PNG_ALFA = readFileSync('tests/imagens/logo-transparente.png');
const JPG = readFileSync('tests/imagens/logo.jpg');
const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function bloco(tipo: string, dados: Buffer, crcErrado = false): Buffer {
  const cabeca = Buffer.alloc(8);
  cabeca.writeUInt32BE(dados.length, 0);
  cabeca.write(tipo, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE((crc32(Buffer.concat([cabeca.subarray(4), dados])) + (crcErrado ? 1 : 0)) >>> 0, 0);
  return Buffer.concat([cabeca, dados, crc]);
}

function ihdr(largura: number, altura: number, cor = 6, entrelacado = 0): Buffer {
  const d = Buffer.alloc(13);
  d.writeUInt32BE(largura, 0);
  d.writeUInt32BE(altura, 4);
  d[8] = 8;
  d[9] = cor;
  d[12] = entrelacado;
  return bloco('IHDR', d);
}

// PNG RGBA de 2×2 correcto: cada linha = 1 byte de filtro + 2 píxeis × 4 bytes.
const linhas = Buffer.alloc(2 * (1 + 8), 0x7f).fill(0, 0, 1).fill(0, 9, 10);
const pngPequeno = (opcoes: { idat?: Buffer; ihdr?: Buffer; fim?: Buffer } = {}) =>
  Buffer.concat([ASSINATURA, opcoes.ihdr ?? ihdr(2, 2), bloco('IDAT', opcoes.idat ?? deflateSync(linhas)), opcoes.fim ?? bloco('IEND', Buffer.alloc(0))]);

describe('PNG', () => {
  it('aceita PNG verdadeiros (com e sem transparência), incluindo um feito à mão', () => {
    expect(!!pngValido(PNG)).toBe(true);
    expect(!!pngValido(PNG_ALFA)).toBe(true);
    expect(!!pngValido(pngPequeno())).toBe(true);
  });

  it('comprimento de bloco "negativo" (0xFFFFFFF4): recusado logo, sem ficar preso', () => {
    const preso = Buffer.alloc(12);
    preso.writeUInt32BE(0xfffffff4, 0);
    preso.write('abcd', 4, 'latin1');
    expect(!!pngValido(Buffer.concat([ASSINATURA, ihdr(2, 2), preso, bloco('IEND', Buffer.alloc(0))]))).toBe(false);
  });

  it('blocos maiores do que o ficheiro, CRC errado, sem IEND, lixo depois do IEND, ou IHDR fora do sítio: recusados', () => {
    const grande = Buffer.alloc(8);
    grande.writeUInt32BE(0x7ffffff0, 0);
    grande.write('IDAT', 4, 'latin1');
    expect(!!pngValido(Buffer.concat([ASSINATURA, ihdr(2, 2), grande]))).toBe(false);
    expect(!!pngValido(Buffer.concat([ASSINATURA, bloco('IHDR', ihdr(2, 2).subarray(8, 21), true)]))).toBe(false);
    expect(!!pngValido(pngPequeno({ fim: Buffer.alloc(0) }))).toBe(false);
    expect(!!pngValido(Buffer.concat([pngPequeno(), Buffer.from('lixo')]))).toBe(false);
    expect(!!pngValido(Buffer.concat([ASSINATURA, bloco('IDAT', deflateSync(linhas)), ihdr(2, 2), bloco('IEND', Buffer.alloc(0))]))).toBe(false);
  });

  it('dimensões enormes, entrelaçado ou tipo de cor inválido: recusados', () => {
    expect(!!pngValido(pngPequeno({ ihdr: ihdr(65535, 65535) }))).toBe(false);
    expect(!!pngValido(pngPequeno({ ihdr: ihdr(2001, 10) }))).toBe(false);
    expect(!!pngValido(pngPequeno({ ihdr: ihdr(2, 2, 6, 1) }))).toBe(false);
    expect(!!pngValido(pngPequeno({ ihdr: ihdr(2, 2, 5) }))).toBe(false);
  });

  it('dados comprimidos estragados ou que não dão o tamanho certo: recusados', () => {
    expect(!!pngValido(pngPequeno({ idat: Buffer.from('nao e zlib nenhum') }))).toBe(false);
    expect(!!pngValido(pngPequeno({ idat: deflateSync(linhas.subarray(0, 10)) }))).toBe(false);
  });

  it('um filtro de linha inválido (só se vê depois de descomprimir): recusado', () => {
    const filtroMau = Buffer.from(linhas);
    filtroMau[9] = 5;
    expect(!!pngValido(pngPequeno({ idat: deflateSync(filtroMau) }))).toBe(false);
  });

  it('PNG animado (APNG): recusado', () => {
    const actl = bloco('acTL', Buffer.alloc(8));
    expect(!!pngValido(Buffer.concat([ASSINATURA, ihdr(2, 2), actl, bloco('IDAT', deflateSync(linhas)), bloco('IEND', Buffer.alloc(0))]))).toBe(false);
  });

  it('bomba de descompressão (50 MB de zeros numa imagem 2×2): recusada sem descomprimir tudo', () => {
    const bomba = deflateSync(Buffer.alloc(50 * 1024 * 1024));
    const inicio = Date.now();
    expect(!!pngValido(pngPequeno({ idat: bomba }))).toBe(false);
    expect(Date.now() - inicio).toBeLessThan(2000);
  });
});

describe('JPEG', () => {
  const jpeg = (largura: number, altura: number, canais = 3) => {
    const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, canais, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
    sof.writeUInt16BE(altura, 5);
    sof.writeUInt16BE(largura, 7);
    return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]);
  };

  it('aceita JPEG verdadeiros', () => {
    expect(!!jpegValido(JPG)).toBe(true);
    expect(!!jpegValido(jpeg(100, 40))).toBe(true);
  });

  it('dimensões enormes, blocos maiores do que o ficheiro, sem SOF ou canais estranhos: recusados', () => {
    expect(!!jpegValido(jpeg(65535, 65535))).toBe(false);
    expect(!!jpegValido(jpeg(100, 40, 7))).toBe(false);
    expect(!!jpegValido(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff]))).toBe(false);
    expect(!!jpegValido(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]))).toBe(false);
    expect(!!jpegValido(Buffer.from('nada'))).toBe(false);
  });

  it('preenchimentos e marcadores sem dados antes das dimensões: recusados (o nosso percurso e o do pdfkit não podem divergir)', () => {
    const bom = jpeg(100, 40);
    expect(!!jpegValido(Buffer.concat([bom.subarray(0, 2), Buffer.from([0xff]), bom.subarray(2)]))).toBe(false);
    expect(!!jpegValido(Buffer.concat([bom.subarray(0, 2), Buffer.from([0xff, 0xd0]), bom.subarray(2)]))).toBe(false);
    expect(!!jpegValido(Buffer.concat([bom.subarray(0, 2), Buffer.from([0x00]), bom.subarray(2)]))).toBe(false);
    expect(jpegValido(bom)).toEqual({ largura: 100, altura: 40 });
  });
});

describe('no PDF', () => {
  it('um logótipo com transparência desenha-se sem problemas; um estragado é ignorado', async () => {
    expect(imagemValida(PNG_ALFA)).toBe(true);
    const desenhar = (logo: Buffer) => {
      const doc = criarDocumento('Teste', { cor: null, rodape: null, logo });
      cabecalho(doc, 'Teste', 'Subtítulo', [], 'agora');
      return terminar(doc);
    };
    const com = await desenhar(PNG_ALFA);
    expect(com.toString('latin1')).toContain('/Subtype /Image');
    const estragado = pngPequeno({ idat: Buffer.from('lixo') });
    expect(imagemValida(estragado)).toBe(false);
    const sem = await desenhar(estragado);
    expect(sem.toString('latin1')).not.toContain('/Subtype /Image');
  });
});
