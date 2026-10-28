import { browser } from 'wxt/browser';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { configItem, CONFIG_PADRAO } from '@/src/config';
import type { Backup } from '@/src/db';
import { pedir, type RespostaLembretes, type ResultadoNotificacao } from '@/src/mensagens';
import { formatarData, hojeCivil } from '@/src/regras/datas';
import { preencherModelo } from '@/src/regras/modelo';
import type { Config } from '@/src/tipos';
import type { RegistroDiagnostico } from '@/src/vetsmart/diagnostico';
import type { RegistroErro } from '@/src/erros';
import {
  IconeAlerta,
  IconeAtualizar,
  IconeBaixar,
  IconeBanco,
  IconeBolo,
  IconeCheck,
  IconeEnviar,
  IconeFerramenta,
  IconeLixeira,
  IconeSeringa,
  IconeSino,
  IconeWhatsApp,
} from '@/src/ui/icones';
import './opcoes.css';

function baixarJson(nome: string, dados: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

const hoje = () => new Date().toISOString().slice(0, 10);

type Aviso = { tipo: 'ok' | 'erro'; texto: string };

/** Campos que o modelo aceita, com o exemplo (fictício) usado na prévia. */
const CAMPOS = [
  { chave: 'tutor', rotulo: 'Tutor', exemplo: 'Ana' },
  { chave: 'pet', rotulo: 'Pet', exemplo: 'Thor' },
  { chave: 'data', rotulo: 'Data', exemplo: formatarData(hojeCivil()) },
  { chave: 'idade', rotulo: 'Idade', exemplo: '5 anos' },
  { chave: 'vacina', rotulo: 'Vacina', exemplo: 'V10' },
] as const;

const EXEMPLO = Object.fromEntries(CAMPOS.map((c) => [c.chave, c.exemplo]));

function Cartao({ id, icone, titulo, descricao, children }: { id: string; icone: ReactNode; titulo: string; descricao: string; children: ReactNode }) {
  return (
    <section className="cartao" id={id}>
      <header className="cartao-topo">
        <span className="cartao-icone">{icone}</span>
        <div>
          <h2>{titulo}</h2>
          <p className="sub">{descricao}</p>
        </div>
      </header>
      <div className="cartao-corpo">{children}</div>
    </section>
  );
}

function Linha({ titulo, descricao, children }: { titulo: string; descricao: string; children: ReactNode }) {
  return (
    <div className="linha">
      <div className="linha-texto">
        <strong>{titulo}</strong>
        <span className="sub">{descricao}</span>
      </div>
      <div className="linha-controle">{children}</div>
    </div>
  );
}

/** Número com botões − e +; aceita digitação livre e ajusta ao sair do campo. */
function Contador({ valor, min, max, unidade, aoMudar }: { valor: number; min: number; max: number; unidade: string; aoMudar: (v: number) => void }) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  const aplicar = (v: number) => aoMudar(Math.min(max, Math.max(min, Number.isFinite(v) ? Math.round(v) : min)));
  return (
    <div className="contador">
      <button type="button" aria-label="Diminuir" disabled={valor <= min} onClick={() => aplicar(valor - 1)}>
        −
      </button>
      <input
        inputMode="numeric"
        value={texto}
        onChange={(e) => setTexto(e.target.value.replace(/\D/g, ''))}
        onBlur={() => aplicar(Number(texto))}
        onKeyDown={(e) => e.key === 'Enter' && aplicar(Number(texto))}
      />
      <button type="button" aria-label="Aumentar" disabled={valor >= max} onClick={() => aplicar(valor + 1)}>
        +
      </button>
      <span className="unidade">{unidade}</span>
    </div>
  );
}

function EditorModelo({ valor, padrao, aoMudar }: { valor: string; padrao: string; aoMudar: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const inserir = (chave: string) => {
    const t = ref.current;
    const marca = `{${chave}}`;
    if (!t) return aoMudar(valor + marca);
    const ini = t.selectionStart;
    const fim = t.selectionEnd;
    aoMudar(valor.slice(0, ini) + marca + valor.slice(fim));
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  };
  return (
    <div className="editor">
      <div className="editor-campos">
        <div className="chips">
          <span className="sub">Inserir:</span>
          {CAMPOS.map((c) => (
            <button key={c.chave} type="button" className="chip" onClick={() => inserir(c.chave)}>
              {c.rotulo}
            </button>
          ))}
        </div>
        <textarea ref={ref} value={valor} onChange={(e) => aoMudar(e.target.value)} rows={5} />
        <button type="button" className="botao fantasma pequeno" disabled={valor === padrao} onClick={() => aoMudar(padrao)}>
          Restaurar texto padrão
        </button>
      </div>
      <div className="previa" aria-label="Prévia da mensagem">
        <span className="sub">Prévia</span>
        <div className="balao">{preencherModelo(valor, EXEMPLO) || <em className="sub">Mensagem vazia</em>}</div>
      </div>
    </div>
  );
}

function textoNotificacao(r: ResultadoNotificacao): Aviso {
  if (!r.permitida) return { tipo: 'erro', texto: 'O Chrome está bloqueando as notificações desta extensão. Libere em chrome://extensions › Detalhes.' };
  return {
    tipo: 'ok',
    texto: `Notificação enviada (${r.pendentes ? `${r.pendentes} pendente${r.pendentes > 1 ? 's' : ''}` : 'sem pendências'}). Se ela não apareceu, o Windows está segurando: veja Configurações › Sistema › Notificações › Google Chrome e o modo Não perturbar.`,
  };
}

function Opcoes() {
  const [config, setConfig] = useState<Config>(CONFIG_PADRAO);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [resultadoTeste, setResultadoTeste] = useState<Aviso | null>(null);
  const [testando, setTestando] = useState(false);
  const [modelo, setModelo] = useState<'aniversario' | 'vacina' | 'atrasada'>('aniversario');
  const [resumo, setResumo] = useState<RespostaLembretes | null>(null);
  const [diag, setDiag] = useState<RegistroDiagnostico[]>([]);
  const [erros, setErros] = useState<RegistroErro[]>([]);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  const carregarErros = async () => setErros(await pedir({ tipo: 'lerErros' }));
  const carregarDiag = async () => setDiag(await pedir({ tipo: 'lerDiagnostico' }));
  const carregarResumo = async () => setResumo(await pedir({ tipo: 'lembretes' }));

  useEffect(() => {
    void configItem.getValue().then((c) => setConfig({ ...CONFIG_PADRAO, ...c }));
    void carregarDiag();
    void carregarErros();
    void carregarResumo();
  }, []);

  const avisar = (a: Aviso) => {
    setAviso(a);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(null), 4500);
  };

  const salvar = async (parcial: Partial<Config>) => {
    const nova = { ...config, ...parcial };
    setConfig(nova);
    await configItem.setValue(nova);
  };

  const executar = async (acao: () => Promise<void>, ok: string) => {
    try {
      await acao();
      avisar({ tipo: 'ok', texto: ok });
    } catch (e) {
      avisar({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    }
  };

  const testarNotificacao = async () => {
    setTestando(true);
    try {
      setResultadoTeste(textoNotificacao(await pedir({ tipo: 'notificarAgora' })));
    } catch (e) {
      setResultadoTeste({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setTestando(false);
    }
  };

  const importar = (arquivo: File | undefined) => {
    if (!arquivo) return;
    void executar(async () => {
      const backup = JSON.parse(await arquivo.text()) as Backup;
      await pedir({ tipo: 'importar', backup });
      await carregarResumo();
    }, 'Backup importado.');
  };

  const nErros = erros.filter((e) => e.nivel !== 'info').length;
  const versao = browser.runtime.getManifest().version;

  return (
    <>
      <header className="topo">
        <div className="topo-conteudo">
          <span className="logo">
            <IconeSino tamanho={22} />
          </span>
          <div>
            <h1>VittaSmart</h1>
            <p>Configurações dos lembretes de aniversários e vacinas</p>
          </div>
          <span className="versao">v{versao}</span>
        </div>
      </header>

      <div className="layout">
        <nav className="menu" aria-label="Seções">
          <a href="#lembretes">
            <IconeSino tamanho={16} /> Lembretes
          </a>
          <a href="#mensagens">
            <IconeWhatsApp tamanho={16} /> Mensagens
          </a>
          <a href="#dados">
            <IconeBanco tamanho={16} /> Dados locais
          </a>
          <a href="#avancado">
            <IconeFerramenta tamanho={16} /> Avançado
          </a>
        </nav>

        <main>
          <Cartao id="lembretes" icone={<IconeSino />} titulo="Lembretes" descricao="Quando cada lembrete aparece e quando o resumo diário chega.">
            <Linha titulo="Antecedência" descricao="Mostra aniversários e vacinas que vencem nos próximos dias.">
              <Contador valor={config.diasAntecedencia} min={0} max={60} unidade="dias" aoMudar={(v) => void salvar({ diasAntecedencia: v })} />
            </Linha>
            <Linha titulo="Vacinas atrasadas" descricao="Doses programadas que já passaram e ainda não foram aplicadas continuam aparecendo por esse número de dias (0 desliga).">

              <Contador valor={config.diasAtrasoVacina} min={0} max={365} unidade="dias" aoMudar={(v) => void salvar({ diasAtrasoVacina: v })} />
            </Linha>
            <Linha titulo="Resumo diário" descricao="Hora da notificação do Chrome com o total de pendências.">
              <select value={config.horaNotificacao} onChange={(e) => void salvar({ horaNotificacao: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </Linha>
            <Linha titulo="Testar notificação" descricao="Envia agora uma notificação, mesmo sem pendências.">
              <button type="button" className="botao" disabled={testando} onClick={() => void testarNotificacao()}>
                <IconeSino tamanho={16} /> {testando ? 'Enviando…' : 'Enviar teste'}
              </button>
            </Linha>
            {resultadoTeste && (
              <p className={`faixa ${resultadoTeste.tipo}`} role="status">
                {resultadoTeste.tipo === 'ok' ? <IconeCheck tamanho={16} /> : <IconeAlerta tamanho={16} />}
                <span>{resultadoTeste.texto}</span>
              </p>
            )}
          </Cartao>

          <Cartao id="mensagens" icone={<IconeWhatsApp tamanho={18} />} titulo="Mensagens do WhatsApp" descricao="Texto que abre pronto na conversa com o tutor. Salva sozinho.">
            <div className="abas" role="tablist">
              <button role="tab" aria-selected={modelo === 'aniversario'} className={modelo === 'aniversario' ? 'ativa' : ''} onClick={() => setModelo('aniversario')}>
                <IconeBolo tamanho={16} /> Aniversário
              </button>
              <button role="tab" aria-selected={modelo === 'vacina'} className={modelo === 'vacina' ? 'ativa' : ''} onClick={() => setModelo('vacina')}>
                <IconeSeringa tamanho={16} /> Vacina
              </button>
              <button role="tab" aria-selected={modelo === 'atrasada'} className={modelo === 'atrasada' ? 'ativa' : ''} onClick={() => setModelo('atrasada')}>
                <IconeAlerta tamanho={16} /> Vacina atrasada
              </button>
            </div>
            {modelo === 'aniversario' && (
              <EditorModelo valor={config.modeloAniversario} padrao={CONFIG_PADRAO.modeloAniversario} aoMudar={(v) => void salvar({ modeloAniversario: v })} />
            )}
            {modelo === 'vacina' && (
              <EditorModelo valor={config.modeloVacina} padrao={CONFIG_PADRAO.modeloVacina} aoMudar={(v) => void salvar({ modeloVacina: v })} />
            )}
            {modelo === 'atrasada' && (
              <EditorModelo
                valor={config.modeloVacinaAtrasada}
                padrao={CONFIG_PADRAO.modeloVacinaAtrasada}
                aoMudar={(v) => void salvar({ modeloVacinaAtrasada: v })}
              />
            )}
          </Cartao>

          <Cartao id="dados" icone={<IconeBanco />} titulo="Dados locais" descricao="Tudo fica só neste navegador, no armazenamento da extensão.">
            {resumo && (
              <div className="numeros">
                <div>
                  <strong>{resumo.totais.pacientes.toLocaleString('pt-BR')}</strong>
                  <span className="sub">pacientes</span>
                </div>
                <div>
                  <strong>{resumo.totais.tutores.toLocaleString('pt-BR')}</strong>
                  <span className="sub">tutores</span>
                </div>
                <div>
                  <strong>{resumo.totais.vacinas.toLocaleString('pt-BR')}</strong>
                  <span className="sub">doses programadas</span>
                </div>
                <div>
                  <strong className="menor">{resumo.ultimaSincronizacao ? new Date(resumo.ultimaSincronizacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</strong>
                  <span className="sub">última sincronização{resumo.origemDados ? ` (${resumo.origemDados})` : ''}</span>
                </div>
              </div>
            )}
            <p className="faixa alerta">
              <IconeAlerta tamanho={16} />
              <span>O backup contém dados pessoais de tutores (LGPD). Guarde com cuidado e nunca envie para o GitHub.</span>
            </p>
            <div className="acoes">
              <button
                type="button"
                className="botao"
                onClick={() => void executar(async () => baixarJson(`vittasmart-backup-${hoje()}.json`, await pedir({ tipo: 'exportar' })), 'Backup exportado.')}
              >
                <IconeBaixar tamanho={16} /> Exportar backup
              </button>
              <label className="botao secundario">
                <IconeEnviar tamanho={16} /> Importar backup
                <input type="file" accept="application/json" hidden onChange={(e) => importar(e.target.files?.[0])} />
              </label>
              <button
                type="button"
                className="botao secundario"
                onClick={() =>
                  void executar(async () => {
                    await pedir({ tipo: 'carregarDemo' });
                    await carregarResumo();
                  }, 'Dados fictícios carregados.')
                }
              >
                Carregar dados fictícios
              </button>
            </div>
            <div className="perigo-zona">
              <div className="linha-texto">
                <strong>Apagar dados locais</strong>
                <span className="sub">Remove pacientes, tutores, vacinas e marcações de enviado. As configurações ficam.</span>
              </div>
              <button
                type="button"
                className="botao perigo"
                onClick={() => {
                  if (confirm('Apagar todos os dados locais da extensão?'))
                    void executar(async () => {
                      await pedir({ tipo: 'apagarTudo' });
                      await carregarResumo();
                    }, 'Dados apagados.');
                }}
              >
                <IconeLixeira tamanho={16} /> Apagar
              </button>
            </div>
          </Cartao>

          <Cartao id="avancado" icone={<IconeFerramenta />} titulo="Avançado" descricao="Ferramentas para investigar problemas com o desenvolvedor.">
            <details className="dobra" id="erros" open={nErros > 0}>
              <summary>
                Relatório de erros e sincronização
                <span className={`selo ${nErros ? 'erro' : ''}`}>{nErros ? `${nErros} erro${nErros > 1 ? 's' : ''}` : `${erros.length} registro${erros.length === 1 ? '' : 's'}`}</span>
              </summary>
              <p className="sub">
                Falhas e passos da sincronização ficam guardados aqui (até 200), com detalhes técnicos. Não incluem senha, token de sessão nem dados de pacientes.
              </p>
              <div className="acoes">
                <button
                  type="button"
                  className="botao"
                  disabled={!erros.length}
                  onClick={() => baixarJson(`vittasmart-erros-${hoje()}.json`, { geradoEm: new Date().toISOString(), versao, navegador: navigator.userAgent, erros })}
                >
                  <IconeBaixar tamanho={16} /> Exportar relatório
                </button>
                <button type="button" className="botao secundario" onClick={() => void carregarErros()}>
                  <IconeAtualizar tamanho={16} /> Atualizar
                </button>
                <button
                  type="button"
                  className="botao fantasma-perigo"
                  disabled={!erros.length}
                  onClick={() =>
                    void executar(async () => {
                      await pedir({ tipo: 'limparErros' });
                      await carregarErros();
                    }, 'Relatório limpo.')
                  }
                >
                  Limpar
                </button>
              </div>
              {erros.length > 0 && (
                <ul className="registros">
                  {erros.slice(0, 15).map((e) => (
                    <li key={e.id ?? e.em} className={e.nivel === 'info' ? 'info' : 'erro'}>
                      <span className="quando">{new Date(e.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })}</span>
                      <strong>{e.contexto}</strong>
                      <span>{e.mensagem}</span>
                      {e.tecnica && e.tecnica !== e.mensagem && <code>{e.tecnica.split('\n')[0]}</code>}
                    </li>
                  ))}
                </ul>
              )}
            </details>

            <details className="dobra">
              <summary>
                Diagnóstico da API do VetSmart
                <span className={`selo ${config.diagnostico ? 'ligado' : ''}`}>{config.diagnostico ? 'ligado' : 'desligado'}</span>
              </summary>
              <p className="sub">
                Com o diagnóstico ligado, recarregue o VetSmart e navegue pela lista de pacientes, pela ficha de um paciente, pela aba de vacinas e pelo cadastro do tutor. A extensão
                registra só a <strong>estrutura</strong> das respostas (endereços e nomes de campos), sem nomes, telefones ou datas.
              </p>
              <label className="chave">
                <input type="checkbox" checked={config.diagnostico} onChange={(e) => void salvar({ diagnostico: e.target.checked })} />
                <span className="trilho" aria-hidden="true" />
                Registrar estrutura das chamadas
              </label>
              <p className="sub">{diag.length} endereço(s) registrado(s).</p>
              <div className="acoes">
                <button type="button" className="botao" disabled={!diag.length} onClick={() => baixarJson(`vittasmart-diagnostico-${hoje()}.json`, diag)}>
                  <IconeBaixar tamanho={16} /> Baixar relatório
                </button>
                <button type="button" className="botao secundario" onClick={() => void carregarDiag()}>
                  <IconeAtualizar tamanho={16} /> Atualizar
                </button>
                <button
                  type="button"
                  className="botao fantasma-perigo"
                  disabled={!diag.length}
                  onClick={() =>
                    void executar(async () => {
                      await pedir({ tipo: 'limparDiagnostico' });
                      await carregarDiag();
                    }, 'Diagnóstico limpo.')
                  }
                >
                  Limpar
                </button>
              </div>
              {diag.length > 0 && <pre>{diag.map((d) => `${d.chave}  (${d.status}, ${d.vezes}x)`).join('\n')}</pre>}
            </details>
          </Cartao>
        </main>
      </div>

      {aviso && (
        <div className={`toast ${aviso.tipo}`} role="status">
          {aviso.tipo === 'ok' ? <IconeCheck tamanho={16} /> : <IconeAlerta tamanho={16} />}
          {aviso.texto}
        </div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('raiz')!).render(<Opcoes />);
