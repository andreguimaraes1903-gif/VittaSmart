import type { DataCivil, Paciente } from '../tipos';
import { diasEntre, ehBissexto, montar, partes } from './datas';

export interface ProximoAniversario {
  paciente: Paciente;
  data: DataCivil;
  diasAte: number;
  idade: number;
}

/** Próxima ocorrência (hoje inclusive). 29/02 vira 28/02 em anos não bissextos. */
export function proximaOcorrencia(nascimento: DataCivil, hoje: DataCivil): { data: DataCivil; idade: number } | null {
  const n = partes(nascimento);
  const h = partes(hoje);
  if (!n || !h) return null;
  const noAno = (ano: number) => {
    const dia = n[1] === 2 && n[2] === 29 && !ehBissexto(ano) ? 28 : n[2];
    return montar(ano, n[1], dia);
  };
  let ano = h[0];
  let data = noAno(ano);
  if (diasEntre(hoje, data) < 0) {
    ano += 1;
    data = noAno(ano);
  }
  const idade = ano - n[0];
  if (idade < 1) return null;
  return { data, idade };
}

export function proximosAniversarios(pacientes: Paciente[], hoje: DataCivil, dias: number): ProximoAniversario[] {
  const lista: ProximoAniversario[] = [];
  for (const paciente of pacientes) {
    if (!paciente.nascimento) continue;
    const oc = proximaOcorrencia(paciente.nascimento, hoje);
    if (!oc) continue;
    const diasAte = diasEntre(hoje, oc.data);
    if (diasAte <= dias) lista.push({ paciente, data: oc.data, diasAte, idade: oc.idade });
  }
  return lista.sort((a, b) => a.diasAte - b.diasAte || a.paciente.nome.localeCompare(b.paciente.nome, 'pt-BR'));
}
