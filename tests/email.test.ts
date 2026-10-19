import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarEnvioDeEmail, esconderEmail } from '../src/server/email/index.js';
import { configTeste } from './ajuda.js';

const mensagem = { para: 'ana@exemplo.ao', assunto: 'Teste', texto: 'Olá', html: '<p>Olá</p>' };
const comResend = configTeste({ RESEND_API_KEY: 're_teste', EMAIL_FROM: 'Eveni <ola@eveni.ao>' });

// Espera que as promessas pendentes do envio terminem.
const esperar = () => new Promise((r) => setTimeout(r, 10));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('envio de e-mail', () => {
  it('sem Resend configurada, escreve o e-mail nos logs em vez de o enviar', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    criarEnvioDeEmail(configTeste())(mensagem);
    expect(fetch).not.toHaveBeenCalled();
    expect(log.mock.calls[0]![0]).toContain('[email:simulado] para=a***@exemplo.ao');
    expect(log.mock.calls[0]![0]).not.toContain('ana@exemplo.ao');
  });

  it('com Resend, envia pela API com a chave e o remetente configurados', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    criarEnvioDeEmail(comResend)(mensagem);
    await esperar();
    const [url, opcoes] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(opcoes.headers.authorization).toBe('Bearer re_teste');
    expect(JSON.parse(opcoes.body)).toMatchObject({ from: 'Eveni <ola@eveni.ao>', to: ['ana@exemplo.ao'], subject: 'Teste' });
  });

  it('uma recusa da Resend fica nos logs com o código de erro, e não lança excepção', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"message":"domain not verified"}', { status: 403 })));
    expect(() => criarEnvioDeEmail(comResend)(mensagem)).not.toThrow();
    await esperar();
    expect(erro.mock.calls[0]![0]).toMatch(/^\[email:erro\] 403 .*domain not verified/);
  });

  it('uma falha de rede fica nos logs e não lança excepção', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    expect(() => criarEnvioDeEmail(comResend)(mensagem)).not.toThrow();
    await esperar();
    expect(erro.mock.calls[0]![0]).toContain('[email:erro] sem-resposta');
  });
});

it('esconde o endereço nos logs', () => {
  expect(esconderEmail('ana.domingos@exemplo.ao')).toBe('a***@exemplo.ao');
  expect(esconderEmail('sem-arroba')).toBe('s***@');
});
