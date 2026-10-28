import { defineContentScript } from 'wxt/utils/define-content-script';
import { estruturaDoCorpo, extrairEstrutura, normalizarUrl } from '@/src/vetsmart/estrutura';
import { ORIGEM_DIAG, type CapturaDiagnostico } from '@/src/vetsmart/diagnostico';
import { ORIGEM_PEDIR_SESSAO, ORIGEM_SESSAO, sessaoDoCorpo, type SessaoParse } from '@/src/vetsmart/sessao';

/**
 * Roda no contexto da página (world MAIN) para enxergar o fetch/XHR do VetSmart.
 *
 * 1. Sessão: repassa ao content script as credenciais que a própria página usa
 *    no Parse, para a sincronização reaproveitar o login (só em memória).
 * 2. Diagnóstico (opcional, ligado nas Opções): envia só a ESTRUTURA das
 *    respostas (nomes de campos e tipos), nunca os valores.
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

    let sessao: SessaoParse | null = null;
    const enviarSessao = () => sessao && window.postMessage({ origem: ORIGEM_SESSAO, sessao }, location.origin);
    const verSessao = (url: string, corpo: unknown) => {
      const nova = sessaoDoCorpo(url, corpo);
      if (!nova) return;
      const mudou = !sessao || sessao.token !== nova.token || (nova.clinicId && nova.clinicId !== sessao.clinicId) || (nova.incluirVacina && nova.incluirVacina !== sessao.incluirVacina);
      sessao = {
        ...nova,
        clinicId: nova.clinicId ?? sessao?.clinicId,
        incluirVacina: nova.incluirVacina ?? sessao?.incluirVacina,
      };
      if (mudou) enviarSessao();
    };
    window.addEventListener('message', (ev) => {
      if (ev.source === window && (ev.data as { origem?: string } | undefined)?.origem === ORIGEM_PEDIR_SESSAO) enviarSessao();
    });

    const fetchOriginal = window.fetch;
    window.fetch = async function (entrada: RequestInfo | URL, init?: RequestInit) {
      try {
        verSessao(entrada instanceof Request ? entrada.url : String(entrada), init?.body);
      } catch {
        // nunca quebra a página
      }
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
      try {
        if (this.__vs) verSessao(new URL(this.__vs.url, location.href).href, corpoReq);
      } catch {
        // nunca quebra a página
      }
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
