import { useId } from 'react';

interface Props {
  rotulo: string;
  nome: string;
  tipo?: 'text' | 'email' | 'password';
  autoComplete: string;
  erro?: string;
  ajuda?: string;
}

export function Campo({ rotulo, nome, tipo = 'text', autoComplete, erro, ajuda }: Props) {
  const id = useId();
  const idDescricao = `${id}-descricao`;
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        name={nome}
        type={tipo}
        autoComplete={autoComplete}
        required
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro || ajuda ? idDescricao : undefined}
      />
      {erro ? (
        <p id={idDescricao} className="campo__erro">
          {erro}
        </p>
      ) : ajuda ? (
        <p id={idDescricao} className="campo__ajuda">
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}
