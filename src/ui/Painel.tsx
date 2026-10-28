import { useCallback, useEffect, useMemo, useState } from 'react';
import { configItem, CONFIG_PADRAO } from '../config';
import { pedir, type RespostaLembretes } from '../mensagens';
import { formatarData } from '../regras/datas';
import { mensagemDoLembrete } from '../regras/lembretes';
import { textoIdade } from '../regras/modelo';
import { linkWhatsapp, normalizarWhatsapp } from '../regras/whatsapp';
import type { Config, Lembrete, TipoLembrete } from '../tipos';
import { IconeAtualizar, IconeBolo, IconeCheck, IconeEngrenagem, IconeFechar, IconeSeringa, IconeWhatsApp } from './icones';

interface Props {
  /** Presente só dentro do VetSmart (content script), onde a sessão está logada. */
  aoSincronizar?: (progresso: (texto: string) => void) => Promise<void>;
  aoFechar?: () => void;
  /** Avisado quando a lista muda (para o contador do botão flutuante). */
  aoMudar?: () => void;
}

const GRUPOS: { titulo: string; filtro: (d: number) => boolean }[] = [
  { titulo: 'Atrasadas', filtro: (d) => d < 0 },
  { titulo: 'Hoje', filtro: (d) => d === 0 },
  { titulo: 'Amanhã', filtro: (d) => d === 1 },
  { titulo: 'Próximos dias', filtro: (d) => d > 1 },
];

export function Painel({ aoSincronizar, aoFechar, aoMudar }: Props) {
  const [aba, setAba] = useState<TipoLembrete>('aniversario');
  const [dados, setDados] = useState<RespostaLembretes | null>(null);
  const [config, setConfig] = useState<Config>(CONFIG_PADRAO);
  const [mostrarEnviados, setMostrarEnviados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
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
    aoMudar?.();
  };

  const sincronizar = async () => {
    if (!aoSincronizar) return;
    setErro(null);
    setSucesso(null);
    setProgresso('Conectando…');
    try {
      await aoSincronizar(setProgresso);
      const novo = await pedir({ tipo: 'lembretes' });
      setDados(novo);
      if (novo.totais.pacientes === 0) {
        setErro('A sincronização terminou, mas o VetSmart não devolveu nenhum paciente. Exporte o relatório nas Opções e envie para o suporte.');
      } else {
        setSucesso(`Pronto! ${novo.totais.pacientes} pacientes, ${novo.totais.tutores} tutores e ${novo.totais.vacinas} próximas doses de vacina.`);
      }
      aoMudar?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProgresso(null);
    }
  };

  const lembretes = dados?.lembretes ?? [];
  const doTipo = lembretes.filter((l) => l.tipo === aba);
  const visiveis = doTipo.filter((l) => mostrarEnviados || !l.enviado);
  const enviados = doTipo.length - doTipo.filter((l) => !l.enviado).length;
  const pendentes = (t: TipoLembrete) => lembretes.filter((l) => l.tipo === t && !l.enviado).length;
  const grupos = useMemo(
    () => GRUPOS.map((g) => ({ ...g, itens: visiveis.filter((l) => g.filtro(l.diasAte)) })).filter((g) => g.itens.length),
    [visiveis],
  );

  return (
    <div className="vs-painel" role="dialog" aria-label="Lembretes VittaSmart">
      <header className="vs-topo">
        <div>
          <div className="vs-titulo">Lembretes</div>
          <div className="vs-subtitulo">Próximos {config.diasAntecedencia} dias</div>
        </div>
        <div className="vs-topo-acoes">
          <button className="vs-icone" onClick={() => void pedir({ tipo: 'abrirOpcoes' })} aria-label="Opções" title="Opções">
            <IconeEngrenagem />
          </button>
          {aoFechar && (
            <button className="vs-icone" onClick={aoFechar} aria-label="Fechar" title="Fechar">
              <IconeFechar />
            </button>
          )}
        </div>
      </header>

      <div className="vs-abas" role="tablist">
        <Aba ativa={aba === 'aniversario'} onClick={() => setAba('aniversario')} icone={<IconeBolo />} rotulo="Aniversários" qtd={pendentes('aniversario')} />
        <Aba ativa={aba === 'vacina'} onClick={() => setAba('vacina')} icone={<IconeSeringa />} rotulo="Vacinas" qtd={pendentes('vacina')} />
      </div>

      {erro && (
        <div className="vs-aviso vs-aviso-erro">
          {erro}
          <button className="vs-link vs-link-erro" onClick={() => void pedir({ tipo: 'abrirOpcoes' })}>
            Ver relatório
          </button>
        </div>
      )}
      {sucesso && <p className="vs-aviso vs-aviso-ok">{sucesso}</p>}

      <div className="vs-lista">
        {dados && visiveis.length === 0 && <Vazio semBase={dados.totais.pacientes === 0} tipo={aba} podeSincronizar={!!aoSincronizar} />}
        {grupos.map((g) => (
          <section key={g.titulo}>
            <h3 className={`vs-grupo${g.titulo === 'Atrasadas' ? ' vs-grupo-alerta' : ''}`}>{g.titulo}</h3>
            <ul>
              {g.itens.map((l) => (
                <ItemLembrete key={l.chave} l={l} config={config} aoMarcar={marcar} />
              ))}
            </ul>
          </section>
        ))}
        {enviados > 0 && (
          <button className="vs-link vs-mostrar" onClick={() => setMostrarEnviados((m) => !m)}>
            {mostrarEnviados ? 'Ocultar enviados' : `Mostrar ${enviados} já enviado${enviados > 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      <footer className="vs-rodape">
        <span className="vs-meta">{textoBase(dados)}</span>
        {aoSincronizar ? (
          <button className="vs-botao vs-botao-sec" onClick={sincronizar} disabled={progresso !== null}>
            <IconeAtualizar tamanho={15} girando={progresso !== null} />
            {progresso ?? 'Sincronizar'}
          </button>
        ) : (
          <span className="vs-meta">Para sincronizar, use o botão dentro do VetSmart.</span>
        )}
      </footer>
    </div>
  );
}

function textoBase(dados: RespostaLembretes | null): string {
  if (!dados?.ultimaSincronizacao) return 'Ainda não sincronizado';
  const quando = new Date(dados.ultimaSincronizacao);
  const min = Math.round((Date.now() - quando.getTime()) / 60000);
  const rel = min < 1 ? 'agora' : min < 60 ? `há ${min} min` : quando.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  return `${dados.origemDados === 'demonstração' ? 'Demonstração' : 'Atualizado'} ${rel}`;
}

function Aba({ ativa, onClick, icone, rotulo, qtd }: { ativa: boolean; onClick: () => void; icone: React.ReactNode; rotulo: string; qtd: number }) {
  return (
    <button role="tab" aria-selected={ativa} className={`vs-aba${ativa ? ' ativa' : ''}`} onClick={onClick}>
      {icone}
      <span>{rotulo}</span>
      {qtd > 0 && <span className="vs-contador">{qtd}</span>}
    </button>
  );
}

function Vazio({ semBase, tipo, podeSincronizar }: { semBase: boolean; tipo: TipoLembrete; podeSincronizar: boolean }) {
  if (semBase) {
    return (
      <div className="vs-vazio">
        <IconeAtualizar tamanho={28} />
        <strong>Nenhum paciente ainda</strong>
        <span>
          {podeSincronizar
            ? 'Clique em "Sincronizar" abaixo para trazer os pacientes do VetSmart.'
            : 'Abra o VetSmart e use o botão de lembretes para sincronizar.'}
        </span>
      </div>
    );
  }
  return (
    <div className="vs-vazio">
      <IconeCheck tamanho={28} />
      <strong>Tudo em dia!</strong>
      <span>{tipo === 'aniversario' ? 'Nenhum aniversário para avisar neste período.' : 'Nenhuma vacina para lembrar neste período.'}</span>
    </div>
  );
}

const CORES = ['#0f766e', '#7c3aed', '#c2410c', '#0369a1', '#be185d', '#4d7c0f'];
function corDo(nome: string): string {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length]!;
}

function selo(diasAte: number): string {
  if (diasAte < 0) return `${-diasAte}d atraso`;
  if (diasAte === 0) return 'Hoje';
  if (diasAte === 1) return 'Amanhã';
  return `em ${diasAte} dias`;
}

function ItemLembrete({ l, config, aoMarcar }: { l: Lembrete; config: Config; aoMarcar: (l: Lembrete, enviado: boolean) => void }) {
  const numero = normalizarWhatsapp(l.tutor?.telefone);
  const detalhe = l.tipo === 'aniversario' ? `Faz ${textoIdade(l.idade ?? 0)}` : l.vacina;
  const urgente = l.diasAte <= 0;
  return (
    <li className={`vs-item${l.enviado ? ' enviado' : ''}`}>
      <div className="vs-avatar" style={{ background: corDo(l.paciente.nome) }} aria-hidden="true">
        {l.paciente.nome.trim().charAt(0).toUpperCase()}
      </div>
      <div className="vs-info">
        <div className="vs-linha1">
          <strong className="vs-nome">{l.paciente.nome}</strong>
          <span className={`vs-selo${l.diasAte < 0 ? ' alerta' : urgente ? ' hoje' : ''}`}>
            {formatarData(l.data)} · {selo(l.diasAte)}
          </span>
        </div>
        <div className="vs-linha2">
          {detalhe}
          {l.paciente.especie ? ` · ${l.paciente.especie}` : ''}
        </div>
        <div className="vs-linha2">Tutor: {l.tutor?.nome ?? 'não informado'}</div>
        <div className="vs-acoes">
          {numero ? (
            <a className="vs-botao vs-whats" href={linkWhatsapp(numero, mensagemDoLembrete(l, config))} target="_blank" rel="noreferrer">
              <IconeWhatsApp /> Enviar lembrete
            </a>
          ) : (
            <span className="vs-sem-tel">Tutor sem celular cadastrado</span>
          )}
          <button
            className={`vs-botao vs-botao-sec${l.enviado ? ' marcado' : ''}`}
            onClick={() => aoMarcar(l, !l.enviado)}
            aria-pressed={l.enviado}
            title={l.enviado ? 'Desmarcar' : 'Marcar como enviado'}
          >
            <IconeCheck tamanho={15} /> {l.enviado ? 'Enviado' : 'Já enviei'}
          </button>
        </div>
      </div>
    </li>
  );
}
