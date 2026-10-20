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

// Sem o nome da pessoa: o endereço ainda não está confirmado, e quem se registou pode não ser o dono
// do e-mail. Incluir texto escolhido por essa pessoa permitiria enviar mensagens enganadoras em nome do Eveni.
export function emailConfirmacao(para: string, url: string): MensagemEmail {
  const c = e.confirmar;
  return {
    para,
    assunto: c.assunto,
    texto: [c.ola, '', c.corpo, '', `${c.botao}: ${url}`, '', c.validade, c.naoFoiVoce, '', e.rodape].join('\n'),
    html: moldeHtml([escaparHtml(c.ola), escaparHtml(c.corpo)], { texto: c.botao, url }, [escaparHtml(c.validade), escaparHtml(c.naoFoiVoce)]),
  };
}

export function emailRecuperacao(para: string, url: string): MensagemEmail {
  const r = e.recuperar;
  return {
    para,
    assunto: r.assunto,
    texto: [e.confirmar.ola, '', r.corpo, '', `${r.botao}: ${url}`, '', r.validade, r.naoFoiVoce, '', e.rodape].join('\n'),
    html: moldeHtml([escaparHtml(e.confirmar.ola), escaparHtml(r.corpo)], { texto: r.botao, url }, [escaparHtml(r.validade), escaparHtml(r.naoFoiVoce)]),
  };
}

// sessoes: 'todas' (recuperação pela ligação) ou 'outras' (mudança com sessão iniciada, que mantém essa).
export function emailPalavraPasseAlterada(para: string, urlRecuperar: string, sessoes: 'todas' | 'outras'): MensagemEmail {
  const a = e.alterada;
  const corpo = sessoes === 'todas' ? a.corpoTodas : a.corpoOutras;
  return {
    para,
    assunto: a.assunto,
    texto: [e.confirmar.ola, '', corpo, '', `${a.botao}: ${urlRecuperar}`, '', a.naoFoiVoce, '', e.rodape].join('\n'),
    html: moldeHtml([escaparHtml(e.confirmar.ola), escaparHtml(corpo)], { texto: a.botao, url: urlRecuperar }, [escaparHtml(a.naoFoiVoce)]),
  };
}

// Aviso de segurança sobre a conta, com ligação para a recuperar se não foi o dono.
export function emailAvisoConta(para: string, assunto: string, corpo: string, urlRecuperar: string): MensagemEmail {
  const botao = e.alterada.botao;
  return {
    para,
    assunto,
    texto: [e.confirmar.ola, '', corpo, '', `${e.seNaoFoiVoce} ${urlRecuperar}`, '', e.rodape].join('\n'),
    html: moldeHtml([escaparHtml(e.confirmar.ola), escaparHtml(corpo)], { texto: botao, url: urlRecuperar }, [escaparHtml(e.seNaoFoiVoce)]),
  };
}

// Sem ligação para recuperar a conta: já não existe.
export function emailContaEliminada(para: string): MensagemEmail {
  const c = e.contaEliminada;
  const p = (t: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#18181b">${escaparHtml(t)}</p>`;
  return {
    para,
    assunto: c.assunto,
    texto: [e.confirmar.ola, '', c.corpo, '', e.rodape].join('\n'),
    html: `<!doctype html><html lang="pt-PT"><body style="margin:0;padding:24px;background:#f6f5fb;font-family:Arial,sans-serif">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 24px;font-size:22px;font-weight:800;font-style:italic;color:#000000">EVENI</p>
${p(e.confirmar.ola)}
${p(c.corpo)}
</div>
<p style="text-align:center;font-size:12px;color:#71717a;margin-top:16px">${escaparHtml(e.rodape)}</p>
</body></html>`,
  };
}

// O nome de quem convida e o nome do espaço são texto escolhido pelo dono do espaço: vão sempre escapados.
// Só donos com e-mail confirmado num plano com equipa podem convidar, e com limite de pedidos.
export function emailConvite(para: string, url: string, quem: string, espaco: string): MensagemEmail {
  const c = e.convite;
  return {
    para,
    assunto: c.assunto,
    texto: [c.corpo(quem, espaco), '', `${c.botao}: ${url}`, '', c.validade, c.naoConhece, '', e.rodape].join('\n'),
    html: moldeHtml([escaparHtml(c.corpo(quem, espaco))], { texto: c.botao, url }, [escaparHtml(c.validade), escaparHtml(c.naoConhece)]),
  };
}
