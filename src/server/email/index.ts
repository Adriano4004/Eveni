import type { Config } from '../config.js';

export interface MensagemEmail {
  para: string;
  assunto: string;
  texto: string;
  html: string;
}

// Envia um e-mail sem bloquear quem chama e sem nunca lançar erros (CLAUDE.md, secção 5, regra 12):
// o registo conclui mesmo que o e-mail falhe, mas a falha fica sempre nos logs com o código.
export type EnviarEmail = (mensagem: MensagemEmail) => void;

const URL_RESEND = 'https://api.resend.com/emails';

export function criarEnvioDeEmail(config: Config): EnviarEmail {
  const chave = config.RESEND_API_KEY;
  const remetente = config.EMAIL_FROM;

  if (!chave || !remetente) {
    // Sem Resend configurada (local, ou staging antes de haver domínio): escrever nos logs.
    // Em produção a configuração é obrigatória (ver config.ts), por isso isto nunca acontece lá.
    // O texto (com a ligação) fica nos logs para se poder testar no staging antes de haver domínio;
    // o endereço fica parcialmente escondido, porque é um dado pessoal.
    return (m) => {
      console.log(`[email:simulado] para=${esconderEmail(m.para)} assunto="${m.assunto}"\n${m.texto}`);
    };
  }

  return (m) => {
    fetch(URL_RESEND, {
      method: 'POST',
      headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: remetente, to: [m.para], subject: m.assunto, text: m.texto, html: m.html }),
      signal: AbortSignal.timeout(10_000),
    })
      .then(async (resposta) => {
        if (resposta.ok) {
          console.log(`[email:enviado] assunto="${m.assunto}"`);
        } else {
          const corpo = (await resposta.text().catch(() => '')).slice(0, 300);
          console.error(`[email:erro] ${resposta.status} assunto="${m.assunto}" resposta=${corpo}`);
        }
      })
      .catch((erro: Error) => {
        console.error(`[email:erro] sem-resposta assunto="${m.assunto}" motivo=${erro.name}: ${erro.message}`);
      });
  };
}

export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// "ana.domingos@exemplo.ao" -> "a***@exemplo.ao"
export function esconderEmail(email: string): string {
  const [local = '', dominio = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${dominio}`;
}
