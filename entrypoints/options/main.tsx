import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { configItem, CONFIG_PADRAO } from '@/src/config';
import type { Backup } from '@/src/db';
import { pedir } from '@/src/mensagens';
import type { Config } from '@/src/tipos';
import type { RegistroDiagnostico } from '@/src/vetsmart/diagnostico';
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

function Opcoes() {
  const [config, setConfig] = useState<Config>(CONFIG_PADRAO);
  const [aviso, setAviso] = useState<string | null>(null);
  const [diag, setDiag] = useState<RegistroDiagnostico[]>([]);

  const carregarDiag = async () => setDiag(await pedir({ tipo: 'lerDiagnostico' }));

  useEffect(() => {
    void configItem.getValue().then((c) => setConfig({ ...CONFIG_PADRAO, ...c }));
    void carregarDiag();
  }, []);

  const avisar = (t: string) => {
    setAviso(t);
    setTimeout(() => setAviso(null), 4000);
  };

  const salvar = async (parcial: Partial<Config>) => {
    const nova = { ...config, ...parcial };
    setConfig(nova);
    await configItem.setValue(nova);
  };

  const executar = async (acao: () => Promise<void>, ok: string) => {
    try {
      await acao();
      avisar(ok);
    } catch (e) {
      avisar(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const importar = (arquivo: File | undefined) => {
    if (!arquivo) return;
    void executar(async () => {
      const backup = JSON.parse(await arquivo.text()) as Backup;
      await pedir({ tipo: 'importar', backup });
    }, 'Backup importado.');
  };

  const numero = (campo: keyof Config, min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      value={config[campo] as number}
      onChange={(e) => {
        const v = Math.min(max, Math.max(min, Number(e.target.value) || min));
        void salvar({ [campo]: v } as Partial<Config>);
      }}
    />
  );

  return (
    <main>
      <h1>VittaSmart – Opções</h1>
      <p className="sub">Lembretes de aniversários e vacinas dos pacientes do VetSmart.</p>
      {aviso && <p className="ok" role="status">{aviso}</p>}

      <h2>Período e notificação</h2>
      <section className="linha">
        <div>
          <label>Avisar com antecedência de (dias)</label>
          {numero('diasAntecedencia', 0, 60)}
        </div>
        <div>
          <label>Hora do resumo diário</label>
          {numero('horaNotificacao', 0, 23)}
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button className="secundario" onClick={() => void executar(() => pedir({ tipo: 'notificarAgora' }), 'Notificação enviada (se houver pendências).')}>
            Testar notificação
          </button>
        </div>
      </section>

      <h2>Mensagens do WhatsApp</h2>
      <section>
        <p className="sub">
          Campos: <code>{'{tutor}'}</code> (primeiro nome), <code>{'{pet}'}</code>, <code>{'{data}'}</code>, <code>{'{idade}'}</code>,{' '}
          <code>{'{vacina}'}</code>.
        </p>
        <label>Aniversário</label>
        <textarea value={config.modeloAniversario} onChange={(e) => void salvar({ modeloAniversario: e.target.value })} />
        <label>Vacina</label>
        <textarea value={config.modeloVacina} onChange={(e) => void salvar({ modeloVacina: e.target.value })} />
        <button className="secundario" onClick={() => void salvar({ modeloAniversario: CONFIG_PADRAO.modeloAniversario, modeloVacina: CONFIG_PADRAO.modeloVacina })}>
          Restaurar padrão
        </button>
      </section>

      <h2>Dados locais</h2>
      <section>
        <p className="aviso">
          Os dados ficam só neste navegador (IndexedDB da extensão). O backup contém dados pessoais de tutores (LGPD): guarde com cuidado e
          nunca envie para o GitHub.
        </p>
        <button onClick={() => void executar(async () => baixarJson(`vittasmart-backup-${hoje()}.json`, await pedir({ tipo: 'exportar' })), 'Backup exportado.')}>
          Exportar backup
        </button>
        <label style={{ display: 'inline-block' }}>
          <span className="sub">Importar backup: </span>
          <input type="file" accept="application/json" onChange={(e) => importar(e.target.files?.[0])} />
        </label>
        <div>
          <button className="secundario" onClick={() => void executar(() => pedir({ tipo: 'carregarDemo' }), 'Dados fictícios carregados.')}>
            Carregar dados fictícios (demonstração)
          </button>
          <button
            className="perigo"
            onClick={() => {
              if (confirm('Apagar todos os dados locais da extensão?')) void executar(() => pedir({ tipo: 'apagarTudo' }), 'Dados apagados.');
            }}
          >
            Apagar dados locais
          </button>
        </div>
      </section>

      <h2>Diagnóstico da API do VetSmart</h2>
      <section>
        <p className="sub">
          Com o diagnóstico ligado, abra o VetSmart (recarregue a página) e navegue pela lista de pacientes, pela ficha de um paciente, pela
          aba de vacinas e pelo cadastro do tutor. A extensão registra só a <strong>estrutura</strong> das respostas (endereços e nomes de
          campos), sem nomes, telefones ou datas. Depois baixe o relatório e envie para o desenvolvedor.
        </p>
        <label className="sub" style={{ fontWeight: 400 }}>
          <input type="checkbox" checked={config.diagnostico} onChange={(e) => void salvar({ diagnostico: e.target.checked })} /> Diagnóstico ligado
        </label>
        <p className="sub">{diag.length} endereço(s) registrado(s).</p>
        <button onClick={() => baixarJson(`vittasmart-diagnostico-${hoje()}.json`, diag)} disabled={!diag.length}>
          Baixar relatório
        </button>
        <button className="secundario" onClick={() => void carregarDiag()}>
          Atualizar
        </button>
        <button className="perigo" onClick={() => void executar(async () => { await pedir({ tipo: 'limparDiagnostico' }); await carregarDiag(); }, 'Diagnóstico limpo.')}>
          Limpar
        </button>
        {diag.length > 0 && <pre>{diag.map((d) => `${d.chave}  (${d.status}, ${d.vezes}x)`).join('\n')}</pre>}
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('raiz')!).render(<Opcoes />);
