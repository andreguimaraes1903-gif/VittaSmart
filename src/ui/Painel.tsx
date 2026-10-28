import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { configItem, CONFIG_PADRAO } from '../config';
import { pedir, type RespostaLembretes } from '../mensagens';
import { descreverPrazo, formatarData } from '../regras/datas';
import { mensagemDoLembrete } from '../regras/lembretes';
import { textoIdade } from '../regras/modelo';
import { linkWhatsapp, normalizarWhatsapp } from '../regras/whatsapp';
import type { Config, Lembrete, TipoLembrete } from '../tipos';

interface Props {
  /** Presente só dentro do VetSmart (content script), onde a sessão está logada. */
  aoSincronizar?: (progresso: (texto: string) => void) => Promise<void>;
  aoFechar?: () => void;
}

export function Painel({ aoSincronizar, aoFechar }: Props) {
  const [aba, setAba] = useState<TipoLembrete>('aniversario');
  const [dados, setDados] = useState<RespostaLembretes | null>(null);
  const [config, setConfig] = useState<Config>(CONFIG_PADRAO);
  const [mostrarEnviados, setMostrarEnviados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await pedir({ tipo: 'lembretes' }));
      setConfig({ ...CONFIG_PADRAO, ...(await configItem.getValue()) });
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const marcar = async (l: Lembrete, enviado: boolean) => {
    await pedir({ tipo: 'marcarEnviado', chave: l.chave, enviado });
    await carregar();
  };

  const sincronizar = async () => {
    if (!aoSincronizar) return;
    setErro(null);
    setProgresso('Iniciando…');
    try {
      await aoSincronizar(setProgresso);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProgresso(null);
    }
  };

  const doTipo = (dados?.lembretes ?? []).filter((l) => l.tipo === aba);
  const visiveis = doTipo.filter((l) => mostrarEnviados || !l.enviado);
  const pendentes = (t: TipoLembrete) => (dados?.lembretes ?? []).filter((l) => l.tipo === t && !l.enviado).length;

  return (
    <div className="vs-painel" role="dialog" aria-label="Lembretes VittaSmart">
      <header className="vs-topo">
        <strong>Lembretes</strong>
        <span className="vs-sub">próximos {config.diasAntecedencia} dias</span>
        {aoFechar && (
          <button className="vs-icone" onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        )}
      </header>

      <div className="vs-abas" role="tablist">
        {(['aniversario', 'vacina'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={aba === t} className={aba === t ? 'ativa' : ''} onClick={() => setAba(t)}>
            {t === 'aniversario' ? '🎂 Aniversários' : '💉 Vacinas'}
            {pendentes(t) > 0 && <span className="vs-contador">{pendentes(t)}</span>}
          </button>
        ))}
      </div>

      {erro && <p className="vs-erro">{erro}</p>}

      <ul className="vs-lista">
        {dados && visiveis.length === 0 && (
          <li className="vs-vazio">
            {dados.totais.pacientes === 0
              ? 'Nenhum paciente na base local. Sincronize com o VetSmart (ou carregue a demonstração nas Opções).'
              : 'Nada para avisar neste período. 🎉'}
          </li>
        )}
        {visiveis.map((l) => (
          <ItemLembrete key={l.chave} l={l} config={config} aoMarcar={marcar} />
        ))}
      </ul>

      <footer className="vs-rodape">
        <label className="vs-check">
          <input type="checkbox" checked={mostrarEnviados} onChange={(e) => setMostrarEnviados(e.target.checked)} />
          mostrar enviados ({doTipo.filter((l) => l.enviado).length})
        </label>
        <div className="vs-sync">
          <span className="vs-sub">
            {dados?.ultimaSincronizacao
              ? `Base: ${new Date(dados.ultimaSincronizacao).toLocaleString('pt-BR')}${dados.origemDados && dados.origemDados !== 'vetsmart' ? ` (${dados.origemDados})` : ''}`
              : 'Base nunca sincronizada'}
          </span>
          {aoSincronizar ? (
            <button className="vs-botao" onClick={sincronizar} disabled={progresso !== null}>
              {progresso ?? 'Sincronizar'}
            </button>
          ) : (
            <span className="vs-sub">Abra o VetSmart para sincronizar.</span>
          )}
        </div>
        <button className="vs-link" onClick={abrirOpcoes}>
          Opções
        </button>
      </footer>
    </div>
  );
}

function abrirOpcoes() {
  window.open(browser.runtime.getURL('/options.html'), '_blank');
}

function ItemLembrete({ l, config, aoMarcar }: { l: Lembrete; config: Config; aoMarcar: (l: Lembrete, enviado: boolean) => void }) {
  const numero = normalizarWhatsapp(l.tutor?.telefone);
  const detalhe = l.tipo === 'aniversario' ? `faz ${textoIdade(l.idade ?? 0)}` : l.vacina;
  return (
    <li className={`vs-item${l.enviado ? ' enviado' : ''}${l.diasAte < 0 ? ' atrasado' : ''}`}>
      <div className="vs-info">
        <div>
          <strong>{l.paciente.nome}</strong>
          {l.paciente.especie && <span className="vs-sub"> · {l.paciente.especie}</span>}
          <span className="vs-sub"> · {detalhe}</span>
        </div>
        <div className="vs-sub vs-prazo">
          {formatarData(l.data)} ({descreverPrazo(l.diasAte)}) · Tutor: {l.tutor?.nome ?? '—'}
        </div>
      </div>
      <div className="vs-acoes">
        {numero ? (
          <a className="vs-botao vs-whats" href={linkWhatsapp(numero, mensagemDoLembrete(l, config))} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        ) : (
          <span className="vs-sub" title="Tutor sem telefone válido no VetSmart">
            sem telefone
          </span>
        )}
        <button className="vs-link" onClick={() => aoMarcar(l, !l.enviado)}>
          {l.enviado ? 'desfazer' : 'marcar enviado'}
        </button>
      </div>
    </li>
  );
}
