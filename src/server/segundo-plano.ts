// Trabalho que corre depois de a resposta seguir (ex.: para o tempo de resposta não revelar nada).
// Os erros ficam sempre nos logs. Os testes e o encerramento podem esperar que tudo termine.
const pendentes = new Set<Promise<unknown>>();

export function emSegundoPlano(descricao: string, trabalho: () => Promise<unknown>): void {
  const promessa = Promise.resolve()
    .then(trabalho)
    .catch((erro) => console.error(`[segundo-plano] ${descricao} falhou:`, erro))
    .finally(() => pendentes.delete(promessa));
  pendentes.add(promessa);
}

export async function esperarSegundoPlano(): Promise<void> {
  while (pendentes.size > 0) await Promise.all([...pendentes]);
}
