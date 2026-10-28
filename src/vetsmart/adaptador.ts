import type { DadosSincronizados } from '../tipos';

export type Progresso = (etapa: string, feitos: number, total?: number) => void;

/**
 * Único ponto que conhece a API interna do VetSmart.
 *
 * Roda no content script (mesma origem da página), então as requisições
 * usam a sessão já logada. Ainda não implementado: depende do relatório do
 * modo diagnóstico (Opções → Diagnóstico) para saber endpoints e campos.
 */
export async function sincronizarVetSmart(_progresso: Progresso): Promise<DadosSincronizados> {
  throw new Error(
    'A sincronização com o VetSmart ainda não foi configurada. Ative o modo diagnóstico nas Opções, navegue por pacientes, tutores e vacinas, e envie o relatório gerado.',
  );
}
