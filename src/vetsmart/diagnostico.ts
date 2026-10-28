import type { Estrutura } from './estrutura';

/** Mensagem enviada do interceptor (world MAIN) para o content script via window.postMessage. */
export const ORIGEM_DIAG = 'vittasmart-diagnostico';

export interface CapturaDiagnostico {
  origem: typeof ORIGEM_DIAG;
  metodo: string;
  url: string; // já normalizada
  status: number;
  cabecalhos: string[]; // só nomes
  corpo?: Estrutura;
  resposta?: Estrutura;
  rotaPagina: string; // location.pathname normalizado
}

export interface RegistroDiagnostico extends Omit<CapturaDiagnostico, 'origem'> {
  chave: string; // "METODO url"
  vezes: number;
  ultimaVez: string;
}
