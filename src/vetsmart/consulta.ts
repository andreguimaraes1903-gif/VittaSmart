import { formaDoFiltro, mensagemAmigavel } from '../erros';
import type { ObjetoParse } from './parse';
import type { SessaoParse } from './sessao';

export const POR_PAGINA = 1000;

export interface OpcoesConsulta {
  keys?: string;
  include?: string;
  limit?: number;
  skip?: number;
  order?: string;
}

/** Pedido do content script ao interceptor (world MAIN), que faz a consulta com a sessão da página. */
export interface PedidoConsulta {
  origem: string;
  id: string;
  classe: string;
  where: Record<string, unknown>;
  op: OpcoesConsulta;
}

export type RespostaConsulta = { origem: string; id: string } & (
  | { ok: true; resultados: ObjetoParse[] }
  | { ok: false; mensagem: string; tecnica?: string; detalhes?: Record<string, unknown> }
);

/** Erro com detalhes técnicos seguros para o relatório. */
export class ErroConsulta extends Error {
  constructor(
    mensagem: string,
    readonly tecnica: string,
    readonly detalhes: Record<string, unknown>,
  ) {
    super(mensagem);
  }
}

/**
 * Uma página de uma classe do Parse. Roda no interceptor (world MAIN), como o
 * próprio SDK do VetSmart: feita pelo background, a mesma consulta voltava
 * vazia, como se fosse anônima (`{"results":[]}` sem erro).
 */
export async function consultarParse(
  s: SessaoParse,
  classe: string,
  where: Record<string, unknown>,
  op: OpcoesConsulta = {},
  fetchFn: typeof fetch = fetch,
): Promise<ObjetoParse[]> {
  const url = `${s.servidor}/classes/${classe}`;
  const limit = op.limit ?? POR_PAGINA;
  const order = op.order ?? 'objectId';
  const detalhes: Record<string, unknown> = { url, classe, filtro: formaDoFiltro(where), keys: op.keys, include: op.include, limit, skip: op.skip, order };
  const corpo = {
    where,
    limit,
    order,
    ...(op.skip ? { skip: op.skip } : {}),
    ...(op.keys ? { keys: op.keys } : {}),
    ...(op.include ? { include: op.include } : {}),
    _method: 'GET',
    _ApplicationId: s.appId,
    _ClientVersion: s.clientVersion,
    _InstallationId: s.installationId,
    _SessionToken: s.token,
  };
  let r: Response;
  try {
    r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(corpo) });
  } catch (e) {
    const tecnica = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    throw new ErroConsulta(mensagemAmigavel(tecnica), tecnica, { ...detalhes, etapa: 'rede' });
  }
  const texto = await r.text();
  let json: { results?: ObjetoParse[]; code?: number; error?: string } = {};
  try {
    json = JSON.parse(texto) as typeof json;
  } catch {
    // resposta não-JSON (ex.: página de erro do proxy)
  }
  if (!r.ok || !Array.isArray(json.results)) {
    const det = { ...detalhes, etapa: 'resposta', status: r.status, codigoParse: json.code, erroParse: json.error, tipoResposta: r.headers.get('content-type') };
    if (json.code === 209) {
      throw new ErroConsulta('Sessão do VetSmart expirada. Recarregue a página, entre de novo e sincronize.', `Parse 209: ${json.error ?? ''}`, det);
    }
    const tecnica = `HTTP ${r.status}${json.code ? ` / Parse ${json.code}` : ''}${json.error ? `: ${json.error}` : ''}`;
    throw new ErroConsulta(`O VetSmart recusou a consulta de ${classe} (${tecnica}).`, tecnica, det);
  }
  return json.results;
}
