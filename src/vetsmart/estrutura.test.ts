import { describe, expect, it } from 'vitest';
import { estruturaDoCorpo, extrairEstrutura, normalizarUrl } from './estrutura';

describe('extrairEstrutura', () => {
  it('não guarda nenhum valor', () => {
    const json = {
      results: [
        { objectId: 'aB3dE5fG7h', nome: 'Thor', nascimento: '2020-03-05', telefone: '(11) 91234-5678', peso: 12.5 },
        { objectId: 'xY9zW8vU7t', nome: 'Mel', castrado: true, email: 'ana@exemplo.com' },
      ],
    };
    const e = extrairEstrutura(json);
    const texto = JSON.stringify(e);
    for (const valor of ['Thor', 'Mel', '2020-03-05', '91234', 'ana@', 'aB3dE5fG7h']) expect(texto).not.toContain(valor);
    expect(e).toEqual({
      tipo: 'objeto',
      campos: {
        results: {
          tipo: 'lista',
          tamanho: 2,
          item: {
            tipo: 'objeto',
            campos: {
              objectId: { tipo: 'texto', formato: 'id?' },
              nome: { tipo: 'texto', mascaras: ['aaaa', 'aaa'] },
              nascimento: { tipo: 'texto', formato: 'data' },
              telefone: { tipo: 'texto', formato: 'telefone?' },
              peso: { tipo: 'numero' },
              castrado: { tipo: 'booleano' },
              email: { tipo: 'texto', formato: 'email?' },
            },
          },
        },
      },
    });
  });
});

describe('privacidade extra', () => {
  it('mascara textos curtos e esconde ids em chaves de ACL', () => {
    const e = extrairEstrutura({ birthday: '05/03', deceased: 'false', ACL: { 'role:Clinic_Pj17tDafNx': { read: true } } });
    expect(JSON.stringify(e)).not.toContain('Pj17tDafNx');
    expect(e).toMatchObject({ campos: { birthday: { mascaras: ['99/99'] }, deceased: { mascaras: ['aaaaa'] }, ACL: { campos: { 'role:…': {} } } } });
  });
  it('mantém include/keys do corpo (são nomes de campos)', () => {
    const e = estruturaDoCorpo(JSON.stringify({ where: { name: 'Thor' }, include: 'vaccine,patient', _SessionToken: 'r:segredo' }));
    expect(JSON.stringify(e)).not.toContain('segredo');
    expect(JSON.stringify(e)).not.toContain('Thor');
    expect(e).toMatchObject({ campos: { include: { valorEsquema: 'vaccine,patient' } } });
  });
});

describe('normalizarUrl', () => {
  it('troca objectId do Parse no caminho', () => {
    expect(normalizarUrl('https://prontuario.vetsmart.com.br/animal/aycxhRhAtx/vacina')).toBe('https://prontuario.vetsmart.com.br/animal/:id/vacina');
  });
  it('troca ids por :id e remove valores da query', () => {
    expect(normalizarUrl('https://api.exemplo.com/pacientes/12345/vacinas?nome=Thor&page=2')).toBe(
      'https://api.exemplo.com/pacientes/:id/vacinas?nome=…&page=…',
    );
    expect(normalizarUrl('/classes/Patient/aB3dE5fG7h')).toBe('https://prontuario.vetsmart.com.br/classes/Patient/:id');
  });
});
