import { mensagens } from '../../shared/mensagens.js';
import { escaparHtml, type MensagemEmail } from './index.js';

const e = mensagens.emails;

// Molde HTML simples, com estilos inline (os programas de e-mail ignoram folhas de estilo).
function moldeHtml(paragrafos: string[], botao: { texto: string; url: string }, notas: string[]): string {
  const p = (t: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#18181b">${t}</p>`;
  return `<!doctype html><html lang="pt-PT"><body style="margin:0;padding:24px;background:#f6f5fb;font-family:Arial,sans-serif">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 24px;font-size:22px;font-weight:800;font-style:italic;color:#000000">EVENI</p>
${paragrafos.map(p).join('\n')}
<p style="margin:24px 0"><a href="${escaparHtml(botao.url)}" style="display:inline-block;background:#6553f3;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${escaparHtml(botao.texto)}</a></p>
${notas.map((n) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#52525b">${n}</p>`).join('\n')}
</div>
<p style="text-align:center;font-size:12px;color:#71717a;margin-top:16px">${escaparHtml(e.rodape)}</p>
</body></html>`;
}

export function emailConfirmacao(para: string, nome: string, url: string): MensagemEmail {
  const c = e.confirmar;
  return {
    para,
    assunto: c.assunto,
    texto: [c.ola(nome), '', c.corpo, '', `${c.botao}: ${url}`, '', c.validade, c.naoFoiVoce, '', e.rodape].join('\n'),
    html: moldeHtml([escaparHtml(c.ola(nome)), escaparHtml(c.corpo)], { texto: c.botao, url }, [escaparHtml(c.validade), escaparHtml(c.naoFoiVoce)]),
  };
}
