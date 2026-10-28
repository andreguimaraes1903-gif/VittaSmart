/** Data civil no formato AAAA-MM-DD (sem fuso). */
export type DataCivil = string;

export interface Paciente {
  id: string;
  nome: string;
  especie?: string;
  nascimento: DataCivil | null;
  tutorId: string | null;
}

export interface Tutor {
  id: string;
  nome: string;
  /** Telefone como veio do VetSmart; é normalizado na hora de montar o link. */
  telefone: string | null;
}

export interface Vacina {
  id: string;
  pacienteId: string;
  nome: string;
  proximaDose: DataCivil;
}

export interface DadosSincronizados {
  pacientes: Paciente[];
  tutores: Tutor[];
  vacinas: Vacina[];
}

export type TipoLembrete = 'aniversario' | 'vacina';

export interface Lembrete {
  /** Identifica a ocorrência (ex.: aniversário de 2026 do paciente X). */
  chave: string;
  tipo: TipoLembrete;
  data: DataCivil;
  /** Negativo = atrasado. */
  diasAte: number;
  paciente: Paciente;
  tutor: Tutor | null;
  /** Só aniversário: idade que o pet completa. */
  idade?: number;
  /** Só vacina. */
  vacina?: string;
  enviado: boolean;
}

export interface Config {
  diasAntecedencia: number;
  diasAtrasoVacina: number;
  horaNotificacao: number;
  modeloAniversario: string;
  modeloVacina: string;
  /** Usado quando a dose programada já passou. */
  modeloVacinaAtrasada: string;
  diagnostico: boolean;
}
