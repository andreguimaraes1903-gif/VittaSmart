import { defineContentScript } from 'wxt/utils/define-content-script';
import { estruturaDoCorpo, extrairEstrutura, normalizarUrl } from '@/src/vetsmart/estrutura';
import { ORIGEM_DIAG, type CapturaDiagnostico } from '@/src/vetsmart/diagnostico';
import { consultarParse, ErroConsulta, type PedidoConsulta, type RespostaConsulta } from '@/src/vetsmart/consulta';
import {
  ORIGEM_CONSULTA,
  ORIGEM_PEDIR_SESSAO,
  ORIGEM_RESPOSTA,
  ORIGEM_SESSAO,
  resumirSessao,
  sessaoDoCorpo,
  type SessaoParse,
} from '@/src/vetsmart/sessao';

/**
 * Roda no contexto da página (world MAIN) para enxergar o fetch/XHR do VetSmart.
 *
 * 1. Sessão: guarda (só em memória) as credenciais que a própria página usa no
 *    Parse e faz aqui as consultas da sincronização, pedidas pelo content script.
 *    O content script recebe só um resumo da sessão, nunca o token.
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
    const enviarSessao = () => sessao && window.postMessage({ origem: ORIGEM_SESSAO, sessao: resumirSessao(sessao) }, location.origin);
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
    const fetchOriginal = window.fetch;

    const responder = (r: RespostaConsulta) => window.postMessage(r, location.origin);
    const consultar = async (p: PedidoConsulta) => {
      const base = { origem: ORIGEM_RESPOSTA, id: p.id };
      if (!sessao) {
        responder({ ...base, ok: false, mensagem: 'Não encontrei a sessão do VetSmart. Navegue um pouco (abra a lista de tutores ou um paciente) e tente de novo.' });
        return;
      }
      try {
        const resultados = await consultarParse(sessao, p.classe, p.where, p.op, (u, i) => fetchOriginal.call(window, u, i));
        responder({ ...base, ok: true, resultados });
      } catch (e) {
        if (e instanceof ErroConsulta) responder({ ...base, ok: false, mensagem: e.message, tecnica: e.tecnica, detalhes: e.detalhes });
        else responder({ ...base, ok: false, mensagem: e instanceof Error ? e.message : String(e) });
      }
    };

    window.addEventListener('message', (ev) => {
      if (ev.source !== window) return;
      const d = ev.data as { origem?: string } | undefined;
      if (d?.origem === ORIGEM_PEDIR_SESSAO) enviarSessao();
      else if (d?.origem === ORIGEM_CONSULTA) void consultar(d as PedidoConsulta);
    });

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
