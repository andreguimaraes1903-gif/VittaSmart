import { describe, expect, it } from 'vitest';
import { extrairEstrutura, normalizarUrl } from './estrutura';

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
              nome: { tipo: 'texto' },
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

describe('normalizarUrl', () => {
  it('troca ids por :id e remove valores da query', () => {
    expect(normalizarUrl('https://api.exemplo.com/pacientes/12345/vacinas?nome=Thor&page=2')).toBe(
      'https://api.exemplo.com/pacientes/:id/vacinas?nome=…&page=…',
    );
    expect(normalizarUrl('/classes/Patient/aB3dE5fG7h')).toBe('https://prontuario.vetsmart.com.br/classes/Patient/:id');
  });
});
