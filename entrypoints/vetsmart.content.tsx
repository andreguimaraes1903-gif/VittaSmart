import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { configItem } from '@/src/config';
import { pedir } from '@/src/mensagens';
import { contarPendentes } from '@/src/regras/lembretes';
import { Painel } from '@/src/ui/Painel';
import { sincronizarVetSmart } from '@/src/vetsmart/adaptador';
import { ORIGEM_DIAG, type CapturaDiagnostico } from '@/src/vetsmart/diagnostico';
import '@/src/ui/estilos.css';

export default defineContentScript({
  matches: ['https://prontuario.vetsmart.com.br/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
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
      setPendentes(p.aniversarios + p.vacinas);
    } catch {
      // extensão recarregada: ignora até o próximo F5
    }
  };

  useEffect(() => {
    void atualizarContador();
  }, []);

  const sincronizar = async (progresso: (t: string) => void) => {
    const dados = await sincronizarVetSmart((etapa, feitos, total) => progresso(`${etapa} ${feitos}${total ? `/${total}` : ''}`));
    progresso('Salvando…');
    await pedir({ tipo: 'salvarDados', dados, origem: 'vetsmart' });
  };

  return (
    <div className="vs-flutuante">
      {aberto && (
        <Painel
          aoSincronizar={sincronizar}
          aoFechar={() => {
            setAberto(false);
            void atualizarContador();
          }}
        />
      )}
      <button className="vs-fab" onClick={() => setAberto((a) => !a)} aria-label="Lembretes de aniversários e vacinas" title="Lembretes VittaSmart">
        🐾
        {pendentes > 0 && <span className="vs-contador">{pendentes}</span>}
      </button>
    </div>
  );
}
