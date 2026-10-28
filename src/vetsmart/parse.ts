/**
 * Conversão dos objetos do Parse Server do VetSmart (parse.vetsmart.com.br)
 * para o modelo interno. Funções puras, testadas.
 *
 * Campos confirmados pelo diagnóstico:
 * - Patient: objectId, name, specie, birthdate {__type:'Date', iso}, birthday, owner/ownerId, deceased, isDeleted
 * - Owner: objectId, name, phone, isDeleted
 * - Vaccine: ainda sem amostra; os campos são deduzidos por heurística (ver interpretarVacinas).
 */
import type { DataCivil, Paciente, Tutor, Vacina } from '../tipos';
import { paraDataCivil } from '../regras/datas';

export type ObjetoParse = Record<string, unknown> & { objectId: string };

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function idPonteiro(v: unknown): string | null {
  if (v && typeof v === 'object' && 'objectId' in v) return texto((v as { objectId: unknown }).objectId);
  return texto(v);
}

/** Aceita {__type:'Date', iso}, string ISO ou dd/mm/aaaa. Usa a data UTC do ISO (meia-noite de SP = 03:00Z). */
export function dataParse(v: unknown): DataCivil | null {
  if (v && typeof v === 'object' && 'iso' in v) return paraDataCivil((v as { iso: unknown }).iso);
  return paraDataCivil(v);
}

const VERDADEIRO = /^(true|sim|s|yes|y|1)$/i;

export function interpretarPaciente(o: ObjetoParse): Paciente | null {
  if (o.isDeleted === true) return null;
  const falecido = o.deceased === true || (typeof o.deceased === 'string' && VERDADEIRO.test(o.deceased.trim()));
  if (falecido) return null;
  return {
    id: o.objectId,
    nome: texto(o.name) ?? '(sem nome)',
    especie: texto(o.specie) ?? undefined,
    nascimento: dataParse(o.birthdate),
    tutorId: idPonteiro(o.owner) ?? texto(o.ownerId),
  };
}

export function interpretarTutor(o: ObjetoParse): Tutor | null {
  if (o.isDeleted === true) return null;
  return {
    id: o.objectId,
    nome: texto(o.name) ?? '(sem nome)',
    telefone: texto(o.phone) ?? texto(o.mobile) ?? texto(o.cellphone) ?? texto(o.whatsapp),
  };
}

const RE_PROXIMA = /(next|revac|booster|due|return|proxim|reforc|reminder)/i;
const RE_NOME = ['name', 'vaccineName', 'nome', 'title', 'product', 'productName', 'description'];

function nomeVacina(o: Record<string, unknown>): string | null {
  for (const k of RE_NOME) {
    const v = o[k];
    if (texto(v)) return texto(v);
  }
  // Ponteiro incluído (ex.: include=vaccine) com nome dentro.
  for (const k of ['vaccine', 'product', 'item', 'protocol']) {
    const v = o[k];
    if (v && typeof v === 'object') {
      const n = nomeVacina(v as Record<string, unknown>);
      if (n) return n;
    }
  }
  return null;
}

/** Data da próxima dose: primeiro campo cujo nome indique "próxima/revacinação" e cujo valor seja data. */
export function campoProximaDose(o: Record<string, unknown>): DataCivil | null {
  for (const [k, v] of Object.entries(o)) {
    if (!RE_PROXIMA.test(k)) continue;
    const d = dataParse(v);
    if (d) return d;
  }
  return null;
}

function dataAplicacao(o: Record<string, unknown>): string {
  for (const k of ['applicationDate', 'appliedAt', 'documentDate', 'date']) {
    const d = dataParse(o[k]);
    if (d) return d;
  }
  return dataParse(o.createdAt) ?? '';
}

/**
 * Para cada paciente + vacina, vale só o registro aplicado mais recente
 * (uma dose antiga cujo "próxima dose" já foi cumprida não vira lembrete).
 */
export function interpretarVacinas(objetos: ObjetoParse[]): Vacina[] {
  const maisRecente = new Map<string, { aplicacao: string; vacina: Vacina | null }>();
  for (const o of objetos) {
    if (o.isDeleted === true) continue;
    const pacienteId = idPonteiro(o.patient) ?? texto(o.patientId);
    if (!pacienteId) continue;
    const nome = nomeVacina(o) ?? 'Vacina';
    const chave = `${pacienteId}|${nome.toLocaleLowerCase('pt-BR')}`;
    const aplicacao = dataAplicacao(o);
    const atual = maisRecente.get(chave);
    if (atual && atual.aplicacao > aplicacao) continue;
    const proximaDose = campoProximaDose(o);
    maisRecente.set(chave, { aplicacao, vacina: proximaDose ? { id: o.objectId, pacienteId, nome, proximaDose } : null });
  }
  return [...maisRecente.values()].flatMap((v) => (v.vacina ? [v.vacina] : []));
}
