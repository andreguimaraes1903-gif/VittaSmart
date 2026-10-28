import type { DadosSincronizados, DataCivil } from './tipos';
import { montar, partes } from './regras/datas';

/** Dados FICTÍCIOS, relativos a hoje, só para demonstrar a extensão. */
export function dadosDemo(hoje: DataCivil): DadosSincronizados {
  const [ano, mes, dia] = partes(hoje)!;
  const em = (dias: number, anosAtras = 0) => {
    const d = new Date(Date.UTC(ano - anosAtras, mes - 1, dia + dias));
    return montar(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  };
  return {
    tutores: [
      { id: 't1', nome: 'Ana Exemplo', telefone: '(11) 91234-5678' },
      { id: 't2', nome: 'Bruno Fictício', telefone: '21 99876-5432' },
      { id: 't3', nome: 'Carla Teste', telefone: null },
    ],
    pacientes: [
      { id: 'p1', nome: 'Thor', especie: 'Cão', nascimento: em(0, 3), tutorId: 't1' },
      { id: 'p2', nome: 'Mel', especie: 'Gata', nascimento: em(2, 1), tutorId: 't2' },
      { id: 'p3', nome: 'Paçoca', especie: 'Cão', nascimento: em(5, 7), tutorId: 't3' },
      { id: 'p4', nome: 'Luna', especie: 'Gata', nascimento: em(40, 2), tutorId: 't1' },
    ],
    vacinas: [
      { id: 'v1', pacienteId: 'p1', nome: 'V10', proximaDose: em(1) },
      { id: 'v2', pacienteId: 'p2', nome: 'Antirrábica', proximaDose: em(4) },
      { id: 'v3', pacienteId: 'p4', nome: 'V4 felina', proximaDose: em(-3) },
      { id: 'v4', pacienteId: 'p3', nome: 'Gripe canina', proximaDose: em(60) },
    ],
  };
}
