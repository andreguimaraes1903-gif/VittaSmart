import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { configItem } from '@/src/config';
import { pedir } from '@/src/mensagens';
import { contarPendentes } from '@/src/regras/lembretes';
import { Painel } from '@/src/ui/Painel';
import { IconeFechar, IconeSino } from '@/src/ui/icones';
import { escutarSessao, estadoSessao, sincronizarVetSmart } from '@/src/vetsmart/adaptador';
import { normalizarUrl } from '@/src/vetsmart/estrutura';
import { ORIGEM_DIAG, type CapturaDiagnostico } from '@/src/vetsmart/diagnostico';
import '@/src/ui/estilos.css';

export default defineContentScript({
  matches: ['https://prontuario.vetsmart.com.br/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    escutarSessao();
    await ligarDiagnostico();

    const ui = await createShadowRootUi(ctx, {
      name: 'vittasmart-lembretes',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount(container) {
        const raiz = ReactDOM.createRoot(container);
        raiz.render(<BotaoFlutuante />);
        return raiz;
      },
      onRemove(raiz) {
        raiz?.unmount();
      },
    });
    ui.mount();
  },
});

/** Repassa ao background o que o interceptor (world MAIN) capturou, se o diagnóstico estiver ligado. */
async function ligarDiagnostico() {
  const aplicar = (ligado: boolean) => {
    if (ligado) document.documentElement.dataset.vittasmartDiag = '1';
    else delete document.documentElement.dataset.vittasmartDiag;
  };
  aplicar((await configItem.getValue()).diagnostico);
  configItem.watch((c) => aplicar(c?.diagnostico ?? false));

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const dado = ev.data as CapturaDiagnostico | undefined;
    if (dado?.origem !== ORIGEM_DIAG) return;
    const { origem: _, ...captura } = dado;
    void pedir({ tipo: 'registrarDiagnostico', captura }).catch(() => undefined);
  });
}

function BotaoFlutuante() {
  const [aberto, setAberto] = useState(false);
  const [pendentes, setPendentes] = useState(0);

  const atualizarContador = async () => {
    try {
      const { lembretes } = await pedir({ tipo: 'lembretes' });
      const p = contarPendentes(lembretes);
      setPendentes(p.total);
    } catch {
      // extensão recarregada: ignora até o próximo F5
    }
  };

  useEffect(() => {
    void atualizarContador();
  }, []);

  const sincronizar = async (progresso: (t: string) => void) => {
    let etapa = 'início';
    try {
      const dados = await sincronizarVetSmart((e, feitos) => {
        etapa = `${e}: ${feitos}`;
        progresso(etapa);
      });
      etapa = 'salvando';
      progresso('Salvando…');
      await pedir({ tipo: 'salvarDados', dados, origem: 'vetsmart' });
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      await pedir({
        tipo: 'registrarErro',
        erro: { contexto: 'Sincronização (resumo)', mensagem, pagina: normalizarUrl(location.href), detalhes: { etapa, ...estadoSessao() } },
      }).catch(() => undefined);
      throw e;
    }
  };

  return (
    <div className="vs-flutuante">
      {aberto && <Painel aoSincronizar={sincronizar} aoFechar={() => setAberto(false)} aoMudar={() => void atualizarContador()} />}
      <button
        className={`vs-fab${aberto ? ' aberto' : ''}`}
        onClick={() => setAberto((a) => !a)}
        aria-label={`Lembretes de aniversários, vacinas e retornos${pendentes ? ` (${pendentes} pendentes)` : ''}`}
        aria-expanded={aberto}
      >
        {aberto ? <IconeFechar tamanho={20} /> : <IconeSino tamanho={20} />}
        {!aberto && <span>Lembretes</span>}
        {!aberto && pendentes > 0 && <span className="vs-contador">{pendentes}</span>}
      </button>
    </div>
  );
}
