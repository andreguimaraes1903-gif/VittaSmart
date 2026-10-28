/** Registro de erro guardado localmente (sem token e sem dados de pacientes). */
export interface RegistroErro {
  id?: number;
  em: string;
  /** 'info' = passo da sincronização registrado para conferência. */
  nivel?: 'erro' | 'info';
  contexto: string;
  mensagem: string;
  /** Mensagem técnica original (ex.: "Failed to fetch"). */
  tecnica?: string;
  detalhes?: Record<string, unknown>;
  pagina?: string;
  versao?: string;
  navegador?: string;
}

export const MAX_ERROS = 200;

/** Traduz falhas comuns para algo acionável, mantendo a original em `tecnica`. */
export function mensagemAmigavel(tecnica: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(tecnica)) {
    return 'Não foi possível conectar ao servidor do VetSmart. Verifique a internet e se algum bloqueador de anúncios/antivírus está bloqueando "parse.vetsmart.com.br".';
  }
  return tecnica;
}

/** Remove valores de um filtro do Parse, mantendo só a forma (nomes de campos e operadores). */
export function formaDoFiltro(v: unknown): unknown {
  if (Array.isArray(v)) return v.length ? [formaDoFiltro(v[0])] : [];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, formaDoFiltro(x)]));
  return typeof v;
}
