import { useEffect, useState } from 'react';

// Navegação mínima entre ecrãs, sem bibliotecas extra.
export function navegar(caminho: string) {
  if (location.pathname === caminho) return;
  history.pushState(null, '', caminho);
  dispatchEvent(new PopStateEvent('popstate'));
}

export function useCaminho(): string {
  const [caminho, setCaminho] = useState(location.pathname);
  useEffect(() => {
    const actualizar = () => setCaminho(location.pathname);
    addEventListener('popstate', actualizar);
    return () => removeEventListener('popstate', actualizar);
  }, []);
  return caminho;
}
