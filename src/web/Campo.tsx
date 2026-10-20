import { useId } from 'react';

interface Props {
  rotulo: string;
  nome: string;
  tipo?: 'text' | 'email' | 'password' | 'tel';
  autoComplete: string;
  erro?: string;
  ajuda?: string;
  // Teclado numérico no telemóvel (ex.: códigos de 6 dígitos).
  numerico?: boolean;
  // Campo que se pode deixar em branco.
  opcional?: boolean;
  // Valor já preenchido (ex.: ao alterar um convidado).
  valorInicial?: string;
}

export function Campo({ rotulo, nome, tipo = 'text', autoComplete, erro, ajuda, numerico, opcional, valorInicial }: Props) {
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
        defaultValue={valorInicial}
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
