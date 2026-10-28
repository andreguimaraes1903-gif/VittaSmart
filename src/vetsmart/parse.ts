/**
 * Conversão dos objetos do Parse Server do VetSmart (parse.vetsmart.com.br)
 * para o modelo interno. Funções puras, testadas.
 *
 * Campos confirmados pelo diagnóstico:
 * - Patient: objectId, name, specie, birthdate {__type:'Date', iso}, birthday, owner/ownerId, deceased, isDeleted
 * - Owner: objectId, name, phone, isDeleted
 * - Vaccine: objectId, patient/patientId, vaccine (nome), vaccineType, documentDate, parentVaccine, ignoreReminder, isDeleted
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

const RE_PROXIMA = /(next|revac|booster|due|proxim|reforc)/i;

function nomeVacina(o: Record<string, unknown>): string | null {
  for (const k of ['vaccine', 'vaccineName', 'name', 'nome', 'vaccineType']) {
    const v = o[k];
    if (texto(v)) return texto(v);
    // Ponteiro incluído com nome dentro.
    if (v && typeof v === 'object') {
      const n = texto((v as Record<string, unknown>).name);
      if (n) return n;
    }
  }
  return null;
}

/** Campo explícito de "próxima dose", se existir (fallback para outros formatos). */
export function campoProximaDose(o: Record<string, unknown>): DataCivil | null {
  for (const [k, v] of Object.entries(o)) {
    if (!RE_PROXIMA.test(k)) continue;
    const d = dataParse(v);
    if (d) return d;
  }
  return null;
}

/**
 * Vacinas do VetSmart (classe Vaccine). Cada dose é um registro com
 * `documentDate`; a dose programada aponta para a anterior em `parentVaccine`.
 * Uma dose com data a partir de hoje é uma dose programada: vira lembrete.
 * `ignoreReminder` = o próprio VetSmart foi instruído a não lembrar.
 * Por paciente + vacina, fica só a próxima dose programada.
 */
export function interpretarVacinas(objetos: ObjetoParse[], hoje: DataCivil): Vacina[] {
  const proxima = new Map<string, Vacina>();
  for (const o of objetos) {
    if (o.isDeleted === true || o.ignoreReminder === true) continue;
    const pacienteId = texto(o.patientId) ?? idPonteiro(o.patient);
    if (!pacienteId) continue;
    const nome = nomeVacina(o) ?? 'Vacina';
    const data = campoProximaDose(o) ?? dataParse(o.documentDate);
    if (!data || data < hoje) continue;
    const chave = `${pacienteId}|${nome.toLocaleLowerCase('pt-BR')}`;
    const atual = proxima.get(chave);
    if (atual && atual.proximaDose <= data) continue;
    proxima.set(chave, { id: o.objectId, pacienteId, nome, proximaDose: data });
  }
  return [...proxima.values()];
}
