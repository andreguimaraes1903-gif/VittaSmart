import type { Config, DadosSincronizados, DataCivil, Lembrete, Tutor } from '../tipos';
import { proximosAniversarios } from './aniversarios';
import { proximasVacinas } from './vacinas';
import { proximosRetornos } from './retornos';
import { formatarData } from './datas';
import { preencherModelo, primeiroNome, textoIdade } from './modelo';

export const chaveAniversario = (pacienteId: string, data: DataCivil) => `aniv:${pacienteId}:${data}`;
export const chaveVacina = (vacinaId: string, data: DataCivil) => `vac:${vacinaId}:${data}`;
export const chaveRetorno = (retornoId: string, data: DataCivil) => `ret:${retornoId}:${data}`;

export function montarLembretes(
  dados: DadosSincronizados,
  enviados: Set<string>,
  hoje: DataCivil,
  config: Pick<Config, 'diasAntecedencia' | 'diasAtrasoVacina'>,
): Lembrete[] {
  const tutores = new Map<string, Tutor>(dados.tutores.map((t) => [t.id, t]));
  const pacientes = new Map(dados.pacientes.map((p) => [p.id, p]));
  const tutorDe = (tutorId: string | null) => (tutorId ? tutores.get(tutorId) ?? null : null);

  const aniversarios: Lembrete[] = proximosAniversarios(dados.pacientes, hoje, config.diasAntecedencia).map((a) => {
    const chave = chaveAniversario(a.paciente.id, a.data);
    return {
      chave,
      tipo: 'aniversario',
      data: a.data,
      diasAte: a.diasAte,
      paciente: a.paciente,
      tutor: tutorDe(a.paciente.tutorId),
      idade: a.idade,
      enviado: enviados.has(chave),
    };
  });

  const vacinas: Lembrete[] = [];
  for (const v of proximasVacinas(dados.vacinas, hoje, config.diasAntecedencia, config.diasAtrasoVacina)) {
    const paciente = pacientes.get(v.vacina.pacienteId);
    if (!paciente) continue;
    const chave = chaveVacina(v.vacina.id, v.vacina.proximaDose);
    vacinas.push({
      chave,
      tipo: 'vacina',
      data: v.vacina.proximaDose,
      diasAte: v.diasAte,
      paciente,
      tutor: tutorDe(paciente.tutorId),
      vacina: v.vacina.nome,
      enviado: enviados.has(chave),
    });
  }

  const retornos: Lembrete[] = [];
  // Backup antigo não tem retornos.
  for (const r of proximosRetornos(dados.retornos ?? [], hoje, config.diasAntecedencia)) {
    const paciente = pacientes.get(r.retorno.pacienteId);
    if (!paciente) continue;
    const chave = chaveRetorno(r.retorno.id, r.retorno.data);
    retornos.push({
      chave,
      tipo: 'retorno',
      data: r.retorno.data,
      diasAte: r.diasAte,
      paciente,
      tutor: tutorDe(paciente.tutorId),
      motivo: r.retorno.motivo,
      enviado: enviados.has(chave),
    });
  }

  return [...aniversarios, ...vacinas, ...retornos];
}

/** Vacina atrasada usa o modelo próprio; sem ele, o de vacina. */
export function mensagemDoLembrete(
  l: Lembrete,
  config: Pick<Config, 'modeloAniversario' | 'modeloVacina'> & Partial<Pick<Config, 'modeloVacinaAtrasada' | 'modeloRetorno'>>,
): string {
  const modelo =
    l.tipo === 'aniversario'
      ? config.modeloAniversario
      : l.tipo === 'retorno'
        ? (config.modeloRetorno ?? '')
        : l.diasAte < 0 && config.modeloVacinaAtrasada
          ? config.modeloVacinaAtrasada
          : config.modeloVacina;
  return preencherModelo(modelo, {
    tutor: l.tutor ? primeiroNome(l.tutor.nome) : '',
    pet: l.paciente.nome,
    data: formatarData(l.data),
    idade: l.idade ? textoIdade(l.idade) : '',
    vacina: l.vacina ?? '',
    motivo: l.motivo ?? '',
  });
}

/** Pendentes que entram no badge e na notificação diária (atrasadas contam). */
export interface Pendentes {
  aniversarios: number;
  vacinas: number;
  retornos: number;
  total: number;
}

export function contarPendentes(lembretes: Lembrete[]): Pendentes {
  const p: Pendentes = { aniversarios: 0, vacinas: 0, retornos: 0, total: 0 };
  for (const l of lembretes) {
    if (l.enviado) continue;
    if (l.tipo === 'aniversario') p.aniversarios++;
    else if (l.tipo === 'vacina') p.vacinas++;
    else p.retornos++;
    p.total++;
  }
  return p;
}
