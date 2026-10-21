import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { mensagens } from '../../shared/mensagens.js';
import { RAIZ } from '../raiz.js';

// Desenho dos PDF (decisão 020), com o pdfkit: só JavaScript, sem browser no servidor.
// Letra Liberation Sans (licença OFL, em assets/fontes): cobre todos os caracteres do português, ao contrário
// das letras de base dos PDF. A página é A4; tudo o que é texto do utilizador entra como texto (nada de HTML).

const FONTES = join(RAIZ, 'assets', 'fontes');
const MARGEM = 50;
const COR_MARCA = '#6553F3';
const COR_TEXTO = '#1d2939';
const COR_SUAVE = '#667085';
const COR_ALERTA = '#b42318';
const COR_LINHA = '#e4e7ec';

export type Documento = PDFKit.PDFDocument;

export interface Coluna {
  titulo: string;
  // Fracção da largura útil (somam 1).
  largura: number;
  alinhar?: 'left' | 'right';
}

export function criarDocumento(titulo: string): Documento {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGEM, bottom: MARGEM + 20, left: MARGEM, right: MARGEM },
    bufferPages: true,
    info: { Title: titulo, Creator: 'Eveni', Producer: 'Eveni' },
    lang: 'pt-PT',
  });
  doc.registerFont('normal', join(FONTES, 'LiberationSans-Regular.ttf'));
  doc.registerFont('negrito', join(FONTES, 'LiberationSans-Bold.ttf'));
  doc.font('normal').fontSize(10).fillColor(COR_TEXTO);
  return doc;
}

const larguraUtil = (doc: Documento) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
const fundoUtil = (doc: Documento) => doc.page.height - doc.page.margins.bottom;

// Garante espaço para `altura` na página actual; senão, passa para a seguinte.
function espaco(doc: Documento, altura: number) {
  if (doc.y + altura > fundoUtil(doc)) doc.addPage();
}

export function cabecalho(doc: Documento, titulo: string, subtitulo: string, detalhes: [string, string][], geradoEm: string) {
  doc.font('negrito').fontSize(9).fillColor(COR_MARCA).text(mensagens.relatorios.marca.toUpperCase(), { characterSpacing: 1 });
  doc.moveDown(0.6);
  doc.font('negrito').fontSize(20).fillColor(COR_TEXTO).text(titulo);
  doc.font('normal').fontSize(12).fillColor(COR_SUAVE).text(subtitulo);
  doc.moveDown(0.8);
  for (const [rotulo, valor] of detalhes) {
    doc.font('negrito').fontSize(10).fillColor(COR_TEXTO).text(`${rotulo}: `, { continued: true }).font('normal').text(valor);
  }
  doc.font('normal').fontSize(8).fillColor(COR_SUAVE).text(geradoEm);
  doc.moveDown(0.5);
  linha(doc);
}

function linha(doc: Documento, cor = COR_LINHA) {
  const y = doc.y + 4;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).lineWidth(0.75).strokeColor(cor).stroke();
  doc.y = y + 8;
}

export function seccao(doc: Documento, titulo: string) {
  espaco(doc, 60);
  doc.moveDown(0.8);
  doc.font('negrito').fontSize(13).fillColor(COR_MARCA).text(titulo, doc.page.margins.left);
  doc.moveDown(0.3);
}

export function paragrafo(doc: Documento, texto: string, opcoes: { alerta?: boolean; negrito?: boolean } = {}) {
  espaco(doc, 20);
  doc
    .font(opcoes.negrito ? 'negrito' : 'normal')
    .fontSize(10)
    .fillColor(opcoes.alerta ? COR_ALERTA : COR_TEXTO)
    .text(texto, doc.page.margins.left, doc.y, { width: larguraUtil(doc) });
  doc.moveDown(0.3);
}

// Tabela simples, com quebra de página (e o cabeçalho repetido na página seguinte).
// `destaque(i)`: a linha i aparece a vermelho (ex.: tarefa em atraso, rubrica acima do previsto);
// `negrito(i)`: a linha i aparece a negrito (ex.: subtotal de uma categoria).
export function tabela(
  doc: Documento,
  colunas: Coluna[],
  linhas: string[][],
  opcoes: { destaque?: (i: number) => boolean; negrito?: (i: number) => boolean } = {},
) {
  const largura = larguraUtil(doc);
  const x0 = doc.page.margins.left;
  const larguras = colunas.map((c) => c.largura * largura);
  const folga = 4;

  const desenharLinha = (celulas: string[], estilo: { fonte: 'normal' | 'negrito'; cor: string; fundo?: string }) => {
    doc.font(estilo.fonte).fontSize(9);
    const altura = Math.max(...celulas.map((t, j) => doc.heightOfString(t, { width: larguras[j]! - 2 * folga }))) + 2 * folga;
    if (doc.y + altura > fundoUtil(doc)) return false;
    const y = doc.y;
    if (estilo.fundo) doc.rect(x0, y, largura, altura).fill(estilo.fundo);
    let x = x0;
    celulas.forEach((t, j) => {
      doc
        .font(estilo.fonte)
        .fontSize(9)
        .fillColor(estilo.cor)
        .text(t, x + folga, y + folga, { width: larguras[j]! - 2 * folga, align: colunas[j]!.alinhar ?? 'left' });
      x += larguras[j]!;
    });
    doc.moveTo(x0, y + altura).lineTo(x0 + largura, y + altura).lineWidth(0.5).strokeColor(COR_LINHA).stroke();
    doc.x = x0;
    doc.y = y + altura;
    return true;
  };
  const cabecalhoTabela = () => desenharLinha(colunas.map((c) => c.titulo), { fonte: 'negrito', cor: COR_SUAVE, fundo: '#f2f4f7' });

  espaco(doc, 50);
  cabecalhoTabela();
  linhas.forEach((celulas, i) => {
    const estilo = { fonte: opcoes.negrito?.(i) ? ('negrito' as const) : ('normal' as const), cor: opcoes.destaque?.(i) ? COR_ALERTA : COR_TEXTO };
    if (!desenharLinha(celulas, estilo)) {
      doc.addPage();
      cabecalhoTabela();
      desenharLinha(celulas, estilo);
    }
  });
  doc.moveDown(0.5);
}

// Pares rótulo/valor alinhados à direita (ex.: totais do orçamento).
export function totais(doc: Documento, pares: [string, string][], destacarUltimos = 2) {
  const largura = larguraUtil(doc);
  espaco(doc, pares.length * 16 + 10);
  doc.moveDown(0.4);
  pares.forEach(([rotulo, valor], i) => {
    const forte = i >= pares.length - destacarUltimos;
    const y = doc.y;
    doc.font(forte ? 'negrito' : 'normal').fontSize(10).fillColor(COR_TEXTO);
    doc.text(rotulo, doc.page.margins.left, y, { width: largura * 0.6 });
    doc.text(valor, doc.page.margins.left + largura * 0.6, y, { width: largura * 0.4, align: 'right' });
    doc.moveDown(0.2);
  });
}

// Rodapé de todas as páginas ("Página n de N") e fim do documento. Devolve o PDF.
export function terminar(doc: Documento): Promise<Buffer> {
  const partes: Buffer[] = [];
  doc.on('data', (p: Buffer) => partes.push(p));
  const fim = new Promise<Buffer>((resolver, rejeitar) => {
    doc.on('end', () => resolver(Buffer.concat(partes)));
    doc.on('error', rejeitar);
  });
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    // Escrever na margem de baixo sem criar uma página nova.
    const margem = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('normal')
      .fontSize(8)
      .fillColor(COR_SUAVE)
      .text(`${mensagens.relatorios.marca}  ·  ${mensagens.relatorios.pagina(i - start + 1, count)}`, MARGEM, doc.page.height - MARGEM, {
        width: doc.page.width - 2 * MARGEM,
        align: 'center',
        lineBreak: false,
      });
    doc.page.margins.bottom = margem;
  }
  doc.end();
  return fim;
}
