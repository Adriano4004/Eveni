import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

// Cifra (AES-256-GCM) para segredos que o servidor precisa de voltar a ler, como o segredo do 2FA.
// Uma fuga só da base de dados não basta para os usar.
// A chave deriva de SESSION_SECRET: mudar essa variável torna ilegíveis os segredos guardados
// (as pessoas com 2FA teriam de usar um código de recuperação). Não a mudar sem planear.

export function criarCifra(segredoDaApp: string, finalidade: string) {
  const chave = Buffer.from(hkdfSync('sha256', segredoDaApp, 'eveni', `cifra:${finalidade}`, 32));
  return {
    cifrar(texto: string): string {
      const iv = randomBytes(12);
      const cifra = createCipheriv('aes-256-gcm', chave, iv);
      const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
      return ['v1', iv.toString('base64url'), cifra.getAuthTag().toString('base64url'), dados.toString('base64url')].join('.');
    },
    decifrar(guardado: string): string {
      const [versao, iv, etiqueta, dados] = guardado.split('.');
      if (versao !== 'v1' || !iv || !etiqueta || !dados) throw new Error('formato cifrado desconhecido');
      const decifra = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64url'));
      decifra.setAuthTag(Buffer.from(etiqueta, 'base64url'));
      return Buffer.concat([decifra.update(Buffer.from(dados, 'base64url')), decifra.final()]).toString('utf8');
    },
  };
}
