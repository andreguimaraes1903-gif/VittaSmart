/**
 * Conversão dos objetos do Parse Server do VetSmart (parse.vetsmart.com.br)
 * para o modelo interno. Funções puras, testadas.
 *
 * Campos confirmados pelo diagnóstico:
 * - Patient: objectId, name, specie, birthdate {__type:'Date', iso}, birthday, owner/ownerId, deceased, isDeleted
 * - Owner: objectId, name, phone, isDeleted
 * - Vaccine: objectId, patient/patientId, vaccine (marca), vaccineType (ex.: "V10", "Antirrábica"),
 *   documentDate, isReminder (true = dose programada, false = aplicada), parentVaccine, ignoreReminder, isDeleted
 * - Return: objectId, patient/patientId, returnDate (data marcada), documentDate (quando foi pedido),
 *   appointment, vaccine, appointmentDrug, examRequest, surgery, prescription, term (motivos, booleanos), notes, isDeleted
 */
import type { DataCivil, Paciente, Retorno, Tutor, Vacina } from '../tipos';
import { paraDataCivil } from '../regras/datas';
import { juntarLista } from '../regras/modelo';

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

/** O tipo ("V10", "Antirrábica") é o que o tutor reconhece; a marca fica de reserva. */
function nomeVacina(o: Record<string, unknown>): string | null {
  for (const k of ['vaccineType', 'vaccine', 'vaccineName', 'name', 'nome']) {
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
 * `documentDate`; a dose programada (`isReminder: true`) aponta para a
 * anterior em `parentVaccine` e vira lembrete, mesmo atrasada (a janela de
 * atraso é das regras). Dose aplicada (`isReminder: false`) não vira lembrete.
 * Sem `isReminder`, vale a data: só a partir de hoje.
 * `ignoreReminder` = o próprio VetSmart foi instruído a não lembrar.
 * Por paciente + vacina, fica só a dose programada mais próxima.
 */
export function interpretarVacinas(objetos: ObjetoParse[], hoje: DataCivil): Vacina[] {
  const proxima = new Map<string, Vacina>();
  for (const o of objetos) {
    if (o.isDeleted === true || o.ignoreReminder === true || o.isReminder === false) continue;
    const pacienteId = texto(o.patientId) ?? idPonteiro(o.patient);
    if (!pacienteId) continue;
    const nome = nomeVacina(o) ?? 'Vacina';
    const data = campoProximaDose(o) ?? dataParse(o.documentDate);
    if (!data || (o.isReminder !== true && data < hoje)) continue;
    const chave = `${pacienteId}|${nome.toLocaleLowerCase('pt-BR')}`;
    const atual = proxima.get(chave);
    if (atual && atual.proximaDose <= data) continue;
    proxima.set(chave, { id: o.objectId, pacienteId, nome, proximaDose: data });
  }
  return [...proxima.values()];
}

/** Rótulos que a tela de Retornos do VetSmart usa para cada motivo marcado. */
const MOTIVOS_RETORNO: [string, string][] = [
  ['appointment', 'Consulta'],
  ['vaccine', 'Vacina'],
  ['appointmentDrug', 'Aplicação de medicamento'],
  ['examRequest', 'Resultado de exame'],
  ['surgery', 'Pós-cirúrgico'],
  ['prescription', 'Entrega/renovação de prescrição'],
  ['term', 'Entrega/renovação de termo ou atestado'],
];

/**
 * Retornos marcados (classe Return), de hoje em diante. As anotações clínicas
 * (`notes`) não são usadas.
 */
export function interpretarRetornos(objetos: ObjetoParse[], hoje: DataCivil): Retorno[] {
  const lista: Retorno[] = [];
  for (const o of objetos) {
    if (o.isDeleted === true) continue;
    const pacienteId = texto(o.patientId) ?? idPonteiro(o.patient);
    const data = dataParse(o.returnDate);
    if (!pacienteId || !data || data < hoje) continue;
    const motivo = juntarLista(MOTIVOS_RETORNO.filter(([campo]) => o[campo] === true).map(([, rotulo]) => rotulo));
    lista.push({ id: o.objectId, pacienteId, data, motivo });
  }
  return lista;
}
