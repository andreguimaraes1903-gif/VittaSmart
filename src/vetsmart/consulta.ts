import { formaDoFiltro, mensagemAmigavel } from '../erros';
import type { ObjetoParse } from './parse';
import type { SessaoParse } from './sessao';

export const POR_PAGINA = 1000;

export interface OpcoesConsulta {
  keys?: string;
  include?: string;
}

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
 * Uma página de uma classe do Parse. Roda no background: com host_permission
 * para parse.vetsmart.com.br, não depende do CORS/CSP da página nem de bloqueadores.
 */
export async function consultarParse(
  s: SessaoParse,
  classe: string,
  where: Record<string, unknown>,
  op: OpcoesConsulta = {},
  fetchFn: typeof fetch = fetch,
): Promise<ObjetoParse[]> {
  const url = `${s.servidor}/classes/${classe}`;
  const detalhes: Record<string, unknown> = { url, classe, filtro: formaDoFiltro(where), keys: op.keys, include: op.include };
  const corpo = {
    where,
    limit: POR_PAGINA,
    order: 'objectId',
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
