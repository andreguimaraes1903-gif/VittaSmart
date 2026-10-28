import Dexie, { type EntityTable } from 'dexie';
import type { DadosSincronizados, Paciente, Tutor, Vacina } from './tipos';
import type { RegistroDiagnostico } from './vetsmart/diagnostico';
import { MAX_ERROS, type RegistroErro } from './erros';

export interface Envio {
  chave: string;
  em: string;
}

export interface Meta {
  chave: string;
  valor: string;
}

/**
 * Banco local (IndexedDB da origem da extensão).
 * Só o background acessa: content scripts usariam o IndexedDB do VetSmart.
 */
export const db = new Dexie('vittasmart') as Dexie & {
  pacientes: EntityTable<Paciente, 'id'>;
  tutores: EntityTable<Tutor, 'id'>;
  vacinas: EntityTable<Vacina, 'id'>;
  envios: EntityTable<Envio, 'chave'>;
  meta: EntityTable<Meta, 'chave'>;
  diagnostico: EntityTable<RegistroDiagnostico, 'chave'>;
  erros: EntityTable<RegistroErro, 'id'>;
};

db.version(1).stores({
  pacientes: 'id, tutorId, nascimento',
  tutores: 'id',
  vacinas: 'id, pacienteId, proximaDose',
  envios: 'chave',
  meta: 'chave',
  diagnostico: 'chave',
});
db.version(2).stores({ erros: '++id, em' });

export async function lerDados(): Promise<DadosSincronizados> {
  const [pacientes, tutores, vacinas] = await Promise.all([db.pacientes.toArray(), db.tutores.toArray(), db.vacinas.toArray()]);
  return { pacientes, tutores, vacinas };
}

/**
 * - substituir: troca tudo (demonstração, backup).
 * - mesclar (sincronização): adiciona/atualiza tutores e pacientes sem apagar os
 *   já salvos; as vacinas são trocadas, pois só interessam as próximas doses.
 *   Dados de demonstração anteriores são descartados para não misturar.
 * Envios ("já enviei") são sempre preservados.
 */
export async function salvarDados(dados: DadosSincronizados, origem: string, modo: 'substituir' | 'mesclar' = 'substituir'): Promise<void> {
  const origemAnterior = await lerMeta('origemDados');
  await db.transaction('rw', [db.pacientes, db.tutores, db.vacinas, db.meta], async () => {
    if (modo === 'substituir' || origemAnterior === 'demonstração') {
      await Promise.all([db.pacientes.clear(), db.tutores.clear()]);
    }
    await db.vacinas.clear();
    await db.pacientes.bulkPut(dados.pacientes);
    await db.tutores.bulkPut(dados.tutores);
    await db.vacinas.bulkPut(dados.vacinas);
    await db.meta.bulkPut([
      { chave: 'ultimaSincronizacao', valor: new Date().toISOString() },
      { chave: 'origemDados', valor: origem },
    ]);
  });
}

export async function lerMeta(chave: string): Promise<string | null> {
  return (await db.meta.get(chave))?.valor ?? null;
}

export interface Backup extends DadosSincronizados {
  versao: 1;
  geradoEm: string;
  envios: Envio[];
}

export async function exportarBackup(): Promise<Backup> {
  return { versao: 1, geradoEm: new Date().toISOString(), ...(await lerDados()), envios: await db.envios.toArray() };
}

export async function importarBackup(b: Backup): Promise<void> {
  if (b?.versao !== 1) throw new Error('Arquivo de backup inválido.');
  await salvarDados(b, 'backup');
  await db.envios.bulkPut(b.envios ?? []);
}

/** Apaga os dados de pacientes (mantém o registro de erros, útil para suporte). */
export async function apagarTudo(): Promise<void> {
  await Promise.all(db.tables.filter((t) => t.name !== 'erros').map((t) => t.clear()));
}

export async function registrarErro(erro: Omit<RegistroErro, 'id'>): Promise<void> {
  await db.erros.add(erro);
  const total = await db.erros.count();
  if (total > MAX_ERROS) {
    const antigos = await db.erros.orderBy('em').limit(total - MAX_ERROS).primaryKeys();
    await db.erros.bulkDelete(antigos);
  }
}
