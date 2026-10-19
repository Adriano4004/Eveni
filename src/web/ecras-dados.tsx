import { useState } from 'react';
import type { Eu } from '../shared/esquemas.js';
import { mensagens } from '../shared/mensagens.js';
import { api, descarregar } from './api.js';
import { Campo } from './Campo.js';
import { Ligacao, Logo } from './ecras.js';
import { Formulario } from './Formulario.js';

const d = mensagens.ecras.dados;

export function EcraDados({ eu, aoEliminar }: { eu: Eu; aoEliminar: () => void }) {
  const [exportado, setExportado] = useState(false);
  return (
    <main className="cartao">
      <Logo />
      <h1>{d.titulo}</h1>

      <section className="seccao seccao--primeira" aria-labelledby="dados-exportar">
        <h2 id="dados-exportar">{d.exportarTitulo}</h2>
        <p className="cartao__subtitulo">{d.exportarExplicacao}</p>
        {exportado && (
          <p className="sucesso" role="status">
            {d.exportado}
          </p>
        )}
        <Formulario
          botao={d.exportar}
          aEnviar={d.aExportar}
          enviar={async (dados) => {
            await descarregar('/api/conta/exportar', dados);
            setExportado(true);
          }}
        >
          {(erros) => (
            <>
              <Campo rotulo={d.palavraPasse} nome="palavraPasse" tipo="password" autoComplete="current-password" erro={erros.palavraPasse} />
              {eu.doisFactores && <Campo rotulo={d.codigo} nome="codigo" autoComplete="one-time-code" erro={erros.codigo} />}
            </>
          )}
        </Formulario>
      </section>

      <section className="seccao seccao--perigo" aria-labelledby="dados-eliminar">
        <h2 id="dados-eliminar">{d.eliminarTitulo}</h2>
        <p className="cartao__subtitulo">{d.eliminarExplicacao}</p>
        <Formulario
          botao={d.eliminar}
          aEnviar={d.aEliminar}
          perigo
          enviar={async (dados) => {
            await api('POST', '/api/conta/eliminar', dados);
            aoEliminar();
          }}
        >
          {(erros) => (
            <>
              <Campo rotulo={d.palavraPasse} nome="palavraPasse" tipo="password" autoComplete="current-password" erro={erros.palavraPasse} />
              {eu.doisFactores && <Campo rotulo={d.codigo} nome="codigo" autoComplete="one-time-code" erro={erros.codigo} />}
              <Campo rotulo={d.confirmacao} nome="confirmacao" autoComplete="off" erro={erros.confirmacao} />
            </>
          )}
        </Formulario>
      </section>

      <p className="cartao__rodape">
        <Ligacao para="/">{d.voltar}</Ligacao>
      </p>
    </main>
  );
}
