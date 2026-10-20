import { type ReactNode, useState } from 'react';

// Secção que abre e fecha com um toque. Começa aberta só se `aberto` for verdade ao aparecer (ex.: lista
// vazia): depois disso fica como a pessoa a deixou, para não fechar o formulário a meio do trabalho.
export function Desdobravel({ titulo, aberto, children }: { titulo: string; aberto: boolean; children: ReactNode }) {
  const [abertoAgora, setAberto] = useState(aberto);
  return (
    <details className="seccao desdobravel" open={abertoAgora} onToggle={(ev) => setAberto(ev.currentTarget.open)}>
      <summary>
        <h2>{titulo}</h2>
      </summary>
      {children}
    </details>
  );
}
