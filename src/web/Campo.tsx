import { useId } from 'react';

interface Props {
  rotulo: string;
  nome: string;
  tipo?: 'text' | 'email' | 'password';
  autoComplete: string;
  erro?: string;
  ajuda?: string;
  // Teclado numérico no telemóvel (ex.: códigos de 6 dígitos).
  numerico?: boolean;
  // Campo que se pode deixar em branco.
  opcional?: boolean;
}

export function Campo({ rotulo, nome, tipo = 'text', autoComplete, erro, ajuda, numerico, opcional }: Props) {
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
        inputMode={numerico ? 'numeric' : undefined}
        pattern={numerico ? '[0-9]*' : undefined}
        required={!opcional}
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
