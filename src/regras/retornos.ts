import type { DataCivil, Retorno } from '../tipos';
import { diasEntre } from './datas';

export interface ProximoRetorno {
  retorno: Retorno;
  diasAte: number;
}

/**
 * Retornos marcados de hoje até `dias` dias. Os que já passaram ficam de fora:
 * o VetSmart não registra se o retorno aconteceu, então não há como saber se
 * está atrasado.
 */
export function proximosRetornos(retornos: Retorno[], hoje: DataCivil, dias: number): ProximoRetorno[] {
  const lista: ProximoRetorno[] = [];
  for (const retorno of retornos) {
    const diasAte = diasEntre(hoje, retorno.data);
    if (Number.isNaN(diasAte)) continue;
    if (diasAte >= 0 && diasAte <= dias) lista.push({ retorno, diasAte });
  }
  return lista.sort((a, b) => a.diasAte - b.diasAte);
}
