// Palavras-passe demasiado comuns, recusadas no registo e na mudança de palavra-passe.
// Só entram as que cumprem as outras regras (10+ caracteres, letras e números): as restantes já são recusadas.
const COMUNS = new Set([
  'password123', 'password1234', 'password12345', 'password2024', 'password2025', 'password2026',
  'qwerty123456', 'qwertyuiop1', 'qwertyuiop123', 'abcdefg123', 'abcdefgh123', 'abc1234567',
  'abcd123456', 'a123456789', 'aa12345678', 'abc123456789', '1234567890a', '123456789a',
  '1234567890q', '1q2w3e4r5t', '1q2w3e4r5t6y', 'q1w2e3r4t5', 'q1w2e3r4t5y6', '1qaz2wsx3edc',
  'zaq12wsxcde3', 'iloveyou123', 'iloveyou1234', 'welcome123', 'welcome1234', 'letmein123',
  'admin12345', 'admin123456', 'administrator1', 'football123', 'princess123', 'sunshine123',
  'monkey12345', 'dragon12345', 'master12345', 'superman123', 'batman12345', 'starwars123',
  'trustno1234', 'passw0rd123', 'p4ssw0rd123', 'teste12345', 'teste123456', 'senha12345',
  'senha123456', 'angola12345', 'angola2024', 'angola2025', 'angola2026', 'luanda12345',
  'luanda2024', 'luanda2025', 'luanda2026', 'eveni12345', 'eveni123456', 'eventos123',
  'eventos2025', 'eventos2026', 'casamento123', 'palavrapasse1', 'palavrapasse123', 'benfica123',
  'benfica1904', 'petro12345', 'kwanza12345', 'jesus12345', 'deus123456', 'amor123456',
]);

export function ePalavraPasseComum(palavraPasse: string): boolean {
  return COMUNS.has(palavraPasse.toLowerCase());
}
