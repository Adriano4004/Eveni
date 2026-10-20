import { type FormEvent, type ReactNode, useState } from 'react';
import { ErroApi, mensagemDeErro } from './api.js';

interface Props {
  botao: string;
  aEnviar: string;
  enviar: (dados: Record<string, string>) => Promise<void>;
  // Acção irreversível: botão em vermelho.
  perigo?: boolean;
  // Limpar os campos depois de enviar com sucesso (ex.: criar outro convite).
  limparAoEnviar?: boolean;
  children: (erros: Record<string, string>) => ReactNode;
}

// Formulário com estado de envio, erro geral e erros por campo vindos do servidor.
export function Formulario({ botao, aEnviar, enviar, children, perigo, limparAoEnviar }: Props) {
  const [aEnviarAgora, setAEnviar] = useState(false);
  const [erroGeral, setErroGeral] = useState<string>();
  const [erros, setErros] = useState<Record<string, string>>({});

  async function submeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setAEnviar(true);
    setErroGeral(undefined);
    setErros({});
    const formulario = evento.currentTarget;
    const dados = Object.fromEntries(new FormData(formulario)) as Record<string, string>;
    try {
      await enviar(dados);
      if (limparAoEnviar) formulario.reset();
    } catch (erro) {
      const campos = erro instanceof ErroApi ? erro.campos : {};
      setErros(campos);
      // Se o erro já aparece junto a um campo, não o repetir no topo.
      if (Object.keys(campos).length === 0) setErroGeral(mensagemDeErro(erro));
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <form className="formulario" onSubmit={submeter} noValidate>
      {erroGeral && (
        <p className="formulario__erro" role="alert">
          {erroGeral}
        </p>
      )}
      {children(erros)}
      <button className={perigo ? 'botao botao--perigo' : 'botao'} type="submit" disabled={aEnviarAgora}>
        {aEnviarAgora ? aEnviar : botao}
      </button>
    </form>
  );
}
