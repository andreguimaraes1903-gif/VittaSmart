import type { DataCivil, Vacina } from '../tipos';
import { diasEntre } from './datas';

export interface ProximaVacina {
  vacina: Vacina;
  diasAte: number;
}

/** Vacinas com próxima dose em até `dias` dias, incluindo atrasadas há até `diasAtraso` dias. */
export function proximasVacinas(vacinas: Vacina[], hoje: DataCivil, dias: number, diasAtraso: number): ProximaVacina[] {
  const lista: ProximaVacina[] = [];
  for (const vacina of vacinas) {
    const diasAte = diasEntre(hoje, vacina.proximaDose);
    if (Number.isNaN(diasAte)) continue;
    if (diasAte <= dias && diasAte >= -diasAtraso) lista.push({ vacina, diasAte });
  }
  return lista.sort((a, b) => a.diasAte - b.diasAte);
}
