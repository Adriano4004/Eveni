import { crc32, inflateSync } from 'node:zlib';

// Verificação estrutural dos logótipos (PNG e JPEG) antes de os guardar e antes de os pôr num PDF.
// O pdfkit (e o png-js por baixo) confia no ficheiro: um PNG feito de propósito podia bloquear o servidor
// (comprimentos de bloco negativos), fazê-lo cair (dados comprimidos estragados, só descomprimidos mais tarde,
// fora de qualquer try/catch) ou esgotar a memória (dimensões enormes). Por isso, aqui lê-se cada bloco com
// limites, confirma-se o CRC, e descomprime-se a imagem inteira com um tecto de tamanho: o que passa daqui o
// pdfkit consegue desenhar sem surpresas.

// Um logótipo não precisa de mais (e assim a imagem descomprimida fica abaixo de 16 MB).
export const MAX_LADO_LOGO = 2000;

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Canais por tipo de cor do PNG (0 cinzento, 2 RGB, 3 paleta, 4 cinzento+alfa, 6 RGBA).
const CANAIS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const PROFUNDIDADES: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

// Dimensões lidas pela nossa verificação, para confirmar que o pdfkit leu as mesmas.
export interface Dimensoes {
  largura: number;
  altura: number;
}

// Blocos de PNG animado (APNG): um logótipo não precisa deles, e o png-js trata-os à parte.
const BLOCOS_ANIMACAO = new Set(['acTL', 'fcTL', 'fdAT']);

export function pngValido(imagem: Buffer): Dimensoes | null {
  if (imagem.length < 8 + 25 + 12 || !imagem.subarray(0, 8).equals(ASSINATURA_PNG)) return null;
  let pos = 8;
  let ihdr: { largura: number; altura: number; profundidade: number; cor: number } | null = null;
  let temPaleta = false;
  let fim = false;
  const dados: Buffer[] = [];
  while (pos < imagem.length) {
    // Comprimento (4) + tipo (4) + dados + CRC (4), tudo dentro do ficheiro.
    if (pos + 12 > imagem.length) return null;
    const comprimento = imagem.readUInt32BE(pos);
    if (comprimento > imagem.length - pos - 12) return null;
    const tipo = imagem.toString('latin1', pos + 4, pos + 8);
    if (!/^[A-Za-z]{4}$/.test(tipo)) return null;
    const conteudo = imagem.subarray(pos + 8, pos + 8 + comprimento);
    if (crc32(imagem.subarray(pos + 4, pos + 8 + comprimento)) !== imagem.readUInt32BE(pos + 8 + comprimento)) return null;
    if (!ihdr && tipo !== 'IHDR') return null;
    if (BLOCOS_ANIMACAO.has(tipo)) return null;
    if (tipo === 'IHDR') {
      if (ihdr || comprimento !== 13) return null;
      const [largura, altura] = [conteudo.readUInt32BE(0), conteudo.readUInt32BE(4)];
      const [profundidade, cor, compressao, filtro, entrelacado] = [conteudo[8]!, conteudo[9]!, conteudo[10]!, conteudo[11]!, conteudo[12]!];
      if (largura < 1 || altura < 1 || largura > MAX_LADO_LOGO || altura > MAX_LADO_LOGO) return null;
      if (!PROFUNDIDADES[cor]?.includes(profundidade) || compressao !== 0 || filtro !== 0) return null;
      // Entrelaçado: raro em logótipos e mais difícil de verificar; recusa-se.
      if (entrelacado !== 0) return null;
      ihdr = { largura, altura, profundidade, cor };
    } else if (tipo === 'PLTE') {
      temPaleta = true;
    } else if (tipo === 'IDAT') {
      dados.push(conteudo);
    } else if (tipo === 'IEND') {
      fim = true;
      pos += 12 + comprimento;
      break;
    }
    pos += 12 + comprimento;
  }
  if (!ihdr || !fim || pos !== imagem.length || dados.length === 0 || (ihdr.cor === 3 && !temPaleta)) return null;
  // Cada linha: 1 byte de filtro + os bytes dos píxeis. A imagem tem de descomprimir para exactamente isto.
  const porLinha = 1 + Math.ceil((ihdr.largura * CANAIS[ihdr.cor]! * ihdr.profundidade) / 8);
  const esperado = porLinha * ihdr.altura;
  try {
    const pixeis = inflateSync(Buffer.concat(dados), { maxOutputLength: esperado + 1 });
    if (pixeis.length !== esperado) return null;
    // O primeiro byte de cada linha é o filtro (0 a 4). Outro valor faz o png-js falhar mais tarde, ao desenhar,
    // num sítio onde o erro já não se apanha (e o servidor caía).
    for (let linha = 0; linha < ihdr.altura; linha++) if (pixeis[linha * porLinha]! > 4) return null;
    return { largura: ihdr.largura, altura: ihdr.altura };
  } catch {
    return null;
  }
}

// Marcadores SOF (início de imagem) do JPEG: indicam as dimensões.
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

// JPEG: o pdfkit não o descomprime (copia-o para o PDF), mas percorre os blocos até às dimensões. Aqui percorrem-se
// do mesmo modo, mas sem tolerâncias: cada bloco começa logo em FF, tem um comprimento válido e cabe no
// ficheiro; preenchimentos (FF FF) e marcadores sem dados antes das dimensões são recusados, para os dois
// percursos (o nosso e o do pdfkit) não poderem divergir. Depois confirma-se que o pdfkit leu as mesmas dimensões.
export function jpegValido(imagem: Buffer): Dimensoes | null {
  if (imagem.length < 4 || imagem[0] !== 0xff || imagem[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 4 <= imagem.length) {
    if (imagem[pos] !== 0xff) return null;
    const marcador = imagem[pos + 1]!;
    // Preenchimento, marcadores sem dados (TEM, RSTn, SOI, EOI) ou início dos dados antes das dimensões.
    if (marcador === 0xff || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xda)) return null;
    const comprimento = imagem.readUInt16BE(pos + 2);
    if (comprimento < 2 || pos + 2 + comprimento > imagem.length) return null;
    if (SOF.has(marcador)) {
      if (comprimento < 8) return null;
      const altura = imagem.readUInt16BE(pos + 5);
      const largura = imagem.readUInt16BE(pos + 7);
      const canais = imagem[pos + 9]!;
      const ok = altura >= 1 && largura >= 1 && altura <= MAX_LADO_LOGO && largura <= MAX_LADO_LOGO && [1, 3, 4].includes(canais);
      return ok ? { largura, altura } : null;
    }
    pos += 2 + comprimento;
  }
  return null;
}
