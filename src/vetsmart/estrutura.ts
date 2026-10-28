/**
 * Descreve a FORMA de um JSON sem guardar nenhum valor (LGPD).
 * Usado pelo modo diagnóstico para mapear a API interna do VetSmart.
 */
export type Estrutura =
  | { tipo: 'nulo' | 'booleano' | 'numero' }
  | { tipo: 'texto'; formato?: 'data' | 'data-hora' | 'telefone?' | 'email?' | 'id?' | 'vazio'; mascaras?: string[]; valorEsquema?: string }
  | { tipo: 'lista'; tamanho: number; item?: Estrutura }
  | { tipo: 'objeto'; campos: Record<string, Estrutura> }
  | { tipo: 'truncado' };

const PROF_MAX = 6;

export function extrairEstrutura(valor: unknown, prof = 0): Estrutura {
  if (prof > PROF_MAX) return { tipo: 'truncado' };
  if (valor === null || valor === undefined) return { tipo: 'nulo' };
  if (typeof valor === 'boolean') return { tipo: 'booleano' };
  if (typeof valor === 'number') return { tipo: 'numero' };
  if (typeof valor === 'string') {
    const formato = formatoTexto(valor);
    const e: Estrutura = formato ? { tipo: 'texto', formato } : { tipo: 'texto' };
    // Textos curtos sem formato conhecido ganham uma máscara (9 = dígito, a = letra):
    // revela o formato ("99/99", "aaaa") sem revelar o valor.
    if (!formato && valor.length <= 12) e.mascaras = [mascarar(valor)];
    return e;
  }
  if (Array.isArray(valor)) {
    // Mescla os campos de até 20 itens para pegar campos opcionais.
    let item: Estrutura | undefined;
    for (const v of valor.slice(0, 20)) item = mesclar(item, extrairEstrutura(v, prof + 1));
    return item ? { tipo: 'lista', tamanho: valor.length, item } : { tipo: 'lista', tamanho: valor.length };
  }
  if (typeof valor === 'object') {
    const campos: Record<string, Estrutura> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) campos[chaveSegura(k)] = extrairEstrutura(v, prof + 1);
    return { tipo: 'objeto', campos };
  }
  return { tipo: 'nulo' };
}

export function mascarar(s: string): string {
  return s.replace(/\d/g, '9').replace(/\p{L}/gu, 'a');
}

/** Chaves que carregam ids (ex.: ACL "role:Clinic_Pj17tDafNx") não vão para o relatório. */
function chaveSegura(k: string): string {
  if (/^role:/.test(k)) return 'role:…';
  if (/^[A-Za-z0-9]{10}$/.test(k) && /[A-Z]/.test(k) && /[a-z]/.test(k)) return ':id';
  return k;
}

function formatoTexto(s: string): 'data' | 'data-hora' | 'telefone?' | 'email?' | 'id?' | 'vazio' | undefined {
  const t = s.trim();
  if (t === '') return 'vazio';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) || /^\d{2}\/\d{2}\/\d{4}$/.test(t)) return 'data';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) return 'data-hora';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) return 'email?';
  if (/^\+?[\d\s().-]{10,18}$/.test(t) && t.replace(/\D/g, '').length >= 10) return 'telefone?';
  if (/^[A-Za-z0-9_-]{8,40}$/.test(t) && /\d/.test(t) && !/\s/.test(t)) return 'id?';
  return undefined;
}

export function mesclar(a: Estrutura | undefined, b: Estrutura): Estrutura {
  if (!a) return b;
  if (a.tipo === 'nulo') return b;
  if (b.tipo === 'nulo') return a;
  if (a.tipo === 'objeto' && b.tipo === 'objeto') {
    const campos = { ...a.campos };
    for (const [k, v] of Object.entries(b.campos)) campos[k] = mesclar(campos[k], v);
    return { tipo: 'objeto', campos };
  }
  if (a.tipo === 'lista' && b.tipo === 'lista') {
    const item = b.item ? mesclar(a.item, b.item) : a.item;
    const tamanho = Math.max(a.tamanho, b.tamanho);
    return item ? { tipo: 'lista', tamanho, item } : { tipo: 'lista', tamanho };
  }
  if (a.tipo === 'texto' && b.tipo === 'texto') {
    const mascaras = [...new Set([...(a.mascaras ?? []), ...(b.mascaras ?? [])])].slice(0, 8);
    const formato = a.formato === 'vazio' ? b.formato : a.formato;
    const r: Estrutura = formato ? { tipo: 'texto', formato } : { tipo: 'texto' };
    if (mascaras.length) r.mascaras = mascaras;
    return r;
  }
  return a;
}

/** Remove valores da URL: ids no caminho viram :id e a query mantém só as chaves. */
export function normalizarUrl(url: string, base = 'https://prontuario.vetsmart.com.br'): string {
  let u: URL;
  try {
    u = new URL(url, base);
  } catch {
    return '(url inválida)';
  }
  const caminho = u.pathname
    .split('/')
    .map((seg) => (/^\d+$/.test(seg) || /^[0-9a-f-]{16,}$/i.test(seg) || ehObjectId(seg) ? ':id' : seg))
    .join('/');
  const chaves = [...new Set([...u.searchParams.keys()])].sort();
  return `${u.origin}${caminho}${chaves.length ? `?${chaves.map((k) => `${k}=…`).join('&')}` : ''}`;
}

/** objectId do Parse: 10 caracteres alfanuméricos com maiúsculas, minúsculas ou dígitos misturados. */
function ehObjectId(seg: string): boolean {
  return /^[A-Za-z0-9]{10}$/.test(seg) && [/[A-Z]/, /[a-z]/, /\d/].filter((r) => r.test(seg)).length >= 2;
}

/** Corpo de requisição (ex.: POST de consulta) também vira só estrutura. */
export function estruturaDoCorpo(corpo: unknown): Estrutura | undefined {
  if (typeof corpo !== 'string' || corpo === '') return undefined;
  try {
    const json = JSON.parse(corpo) as unknown;
    const e = extrairEstrutura(json);
    // include/keys/order/className são nomes de campos (esquema), não dados: mantém o valor.
    if (e.tipo === 'objeto' && json && typeof json === 'object') {
      for (const k of ['include', 'keys', 'order', 'className']) {
        const v = (json as Record<string, unknown>)[k];
        if (typeof v === 'string' && /^[\w.,-]*$/.test(v)) e.campos[k] = { tipo: 'texto', valorEsquema: v } as Estrutura;
      }
    }
    return e;
  } catch {
    return { tipo: 'texto' };
  }
}
