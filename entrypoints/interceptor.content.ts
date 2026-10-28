import { defineContentScript } from 'wxt/utils/define-content-script';
import { estruturaDoCorpo, extrairEstrutura, normalizarUrl } from '@/src/vetsmart/estrutura';
import { ORIGEM_DIAG, type CapturaDiagnostico } from '@/src/vetsmart/diagnostico';

/**
 * Modo diagnóstico. Roda no contexto da página (world MAIN) para enxergar o
 * fetch/XHR do VetSmart. Só envia a ESTRUTURA das respostas (nomes de campos e
 * tipos), nunca os valores, e só quando o diagnóstico está ligado nas Opções.
 */
export default defineContentScript({
  matches: ['https://prontuario.vetsmart.com.br/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const ligado = () => document.documentElement.dataset.vittasmartDiag === '1';

    const publicar = (c: Omit<CapturaDiagnostico, 'origem' | 'rotaPagina'>) => {
      const captura: CapturaDiagnostico = { ...c, origem: ORIGEM_DIAG, rotaPagina: normalizarUrl(location.href) };
      window.postMessage(captura, location.origin);
    };

    const ehJson = (tipo: string | null) => !!tipo && tipo.includes('json');

    const fetchOriginal = window.fetch;
    window.fetch = async function (entrada: RequestInfo | URL, init?: RequestInit) {
      const resposta = await fetchOriginal.call(this, entrada, init);
      if (ligado()) {
        try {
          const req = entrada instanceof Request ? entrada : null;
          const url = req ? req.url : String(entrada);
          const metodo = (init?.method ?? req?.method ?? 'GET').toUpperCase();
          const cabecalhos = [...new Headers(init?.headers ?? req?.headers).keys()];
          const corpo = estruturaDoCorpo(init?.body);
          if (ehJson(resposta.headers.get('content-type'))) {
            resposta
              .clone()
              .json()
              .then((json: unknown) =>
                publicar({ metodo, url: normalizarUrl(url), status: resposta.status, cabecalhos, corpo, resposta: extrairEstrutura(json) }),
              )
              .catch(() => undefined);
          }
        } catch {
          // diagnóstico nunca pode quebrar a página
        }
      }
      return resposta;
    };

    const abrir = XMLHttpRequest.prototype.open;
    const definirCabecalho = XMLHttpRequest.prototype.setRequestHeader;
    const enviar = XMLHttpRequest.prototype.send;
    type XhrDiag = XMLHttpRequest & { __vs?: { metodo: string; url: string; cabecalhos: string[] } };

    XMLHttpRequest.prototype.open = function (this: XhrDiag, metodo: string, url: string | URL, ...resto: unknown[]) {
      this.__vs = { metodo: metodo.toUpperCase(), url: String(url), cabecalhos: [] };
      return (abrir as (...a: unknown[]) => void).call(this, metodo, url, ...resto);
    } as typeof XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.setRequestHeader = function (this: XhrDiag, nome: string, valor: string) {
      this.__vs?.cabecalhos.push(nome.toLowerCase());
      return definirCabecalho.call(this, nome, valor);
    };

    XMLHttpRequest.prototype.send = function (this: XhrDiag, corpoReq?: Document | XMLHttpRequestBodyInit | null) {
      if (ligado() && this.__vs) {
        const info = this.__vs;
        const corpo = estruturaDoCorpo(corpoReq);
        this.addEventListener('load', () => {
          try {
            if (!ehJson(this.getResponseHeader('content-type'))) return;
            const json: unknown = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
            publicar({ ...info, url: normalizarUrl(info.url), status: this.status, corpo, resposta: extrairEstrutura(json) });
          } catch {
            // ignora
          }
        });
      }
      return enviar.call(this, corpoReq);
    };
  },
});
