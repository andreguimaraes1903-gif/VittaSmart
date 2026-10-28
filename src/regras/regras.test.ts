import { describe, expect, it } from 'vitest';
import { proximaOcorrencia, proximosAniversarios } from './aniversarios';
import { descreverPrazo, diasEntre, paraDataCivil } from './datas';
import { chaveAniversario, contarPendentes, mensagemDoLembrete, montarLembretes } from './lembretes';
import { preencherModelo, primeiroNome, textoIdade } from './modelo';
import { proximasVacinas } from './vacinas';
import { linkWhatsapp, normalizarWhatsapp } from './whatsapp';
import { CONFIG_PADRAO } from '../config';
import { dadosDemo } from '../demo';
import type { Paciente } from '../tipos';

const pet = (id: string, nascimento: string | null): Paciente => ({ id, nome: id, nascimento, tutorId: null });

describe('datas', () => {
  it('conta dias atravessando a virada do ano', () => {
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3);
    expect(diasEntre('2026-10-28', '2026-10-25')).toBe(-3);
  });
  it('converte formatos do VetSmart', () => {
    expect(paraDataCivil('05/03/2020')).toBe('2020-03-05');
    expect(paraDataCivil('2020-03-05T03:00:00.000Z')).toBe('2020-03-05');
    expect(paraDataCivil('31/02/2020')).toBeNull();
    expect(paraDataCivil(123)).toBeNull();
  });
  it('descreve o prazo', () => {
    expect(descreverPrazo(0)).toBe('hoje');
    expect(descreverPrazo(1)).toBe('amanhã');
    expect(descreverPrazo(5)).toBe('em 5 dias');
    expect(descreverPrazo(-2)).toBe('atrasada há 2 dias');
  });
});

describe('aniversários', () => {
  it('usa o ano seguinte quando já passou', () => {
    expect(proximaOcorrencia('2020-01-10', '2026-12-28')).toEqual({ data: '2027-01-10', idade: 7 });
  });
  it('inclui o próprio dia', () => {
    expect(proximaOcorrencia('2023-10-28', '2026-10-28')).toEqual({ data: '2026-10-28', idade: 3 });
  });
  it('29/02 vira 28/02 em ano não bissexto', () => {
    expect(proximaOcorrencia('2020-02-29', '2026-02-01')).toEqual({ data: '2026-02-28', idade: 6 });
    expect(proximaOcorrencia('2020-02-29', '2028-02-01')).toEqual({ data: '2028-02-29', idade: 8 });
  });
  it('ignora quem ainda não completa 1 ano', () => {
    expect(proximaOcorrencia('2026-11-01', '2026-10-28')).toBeNull();
  });
  it('filtra pela janela e ordena', () => {
    const lista = proximosAniversarios(
      [pet('c', '2020-11-04'), pet('a', '2019-10-30'), pet('b', null), pet('d', '2018-12-25')],
      '2026-10-28',
      7,
    );
    expect(lista.map((a) => [a.paciente.id, a.diasAte])).toEqual([
      ['a', 2],
      ['c', 7],
    ]);
  });
});

describe('vacinas', () => {
  it('inclui atrasadas dentro do limite', () => {
    const v = (id: string, proximaDose: string) => ({ id, pacienteId: 'p', nome: id, proximaDose });
    const lista = proximasVacinas([v('futura', '2026-11-30'), v('logo', '2026-11-01'), v('atrasada', '2026-10-20'), v('velha', '2026-01-01')], '2026-10-28', 7, 30);
    expect(lista.map((x) => [x.vacina.id, x.diasAte])).toEqual([
      ['atrasada', -8],
      ['logo', 4],
    ]);
  });
});

describe('whatsapp', () => {
  it('normaliza telefones brasileiros', () => {
    expect(normalizarWhatsapp('(11) 91234-5678')).toBe('5511912345678');
    expect(normalizarWhatsapp('011 3456-7890')).toBe('551134567890');
    expect(normalizarWhatsapp('+55 21 99876-5432')).toBe('5521998765432');
    expect(normalizarWhatsapp('1234')).toBeNull();
    expect(normalizarWhatsapp(null)).toBeNull();
  });
  it('monta o link com a mensagem codificada', () => {
    expect(linkWhatsapp('5511912345678', 'Olá, Ana & cia!')).toBe('https://wa.me/5511912345678?text=Ol%C3%A1%2C%20Ana%20%26%20cia!');
  });
});

describe('modelo', () => {
  it('preenche campos e deixa vazios os ausentes', () => {
    expect(preencherModelo('Oi {tutor}, {pet} {x}!', { tutor: 'Ana', pet: 'Thor' })).toBe('Oi Ana, Thor !');
    expect(textoIdade(1)).toBe('1 ano');
    expect(textoIdade(4)).toBe('4 anos');
    expect(primeiroNome('  Maria  Souza ')).toBe('Maria');
  });
});

describe('montarLembretes', () => {
  const hoje = '2026-10-28';
  const dados = dadosDemo(hoje);

  it('junta paciente e tutor e respeita a janela', () => {
    const lembretes = montarLembretes(dados, new Set(), hoje, CONFIG_PADRAO);
    const nomes = (tipo: string) => lembretes.filter((l) => l.tipo === tipo).map((l) => l.paciente.nome);
    expect(nomes('aniversario')).toEqual(['Thor', 'Mel', 'Paçoca']);
    expect(nomes('vacina')).toEqual(['Luna', 'Thor', 'Mel']);
    expect(lembretes[0]?.tutor?.nome).toBe('Ana Exemplo');
  });

  it('marca enviados e não os conta como pendentes', () => {
    const thor = dados.pacientes.find((p) => p.nome === 'Thor')!;
    const lembretes = montarLembretes(dados, new Set([chaveAniversario(thor.id, hoje)]), hoje, CONFIG_PADRAO);
    expect(lembretes.find((l) => l.tipo === 'aniversario' && l.paciente.id === thor.id)?.enviado).toBe(true);
    expect(contarPendentes(lembretes)).toEqual({ aniversarios: 2, vacinas: 3 });
  });

  it('gera a mensagem com primeiro nome, data e idade', () => {
    const [l] = montarLembretes(dados, new Set(), hoje, CONFIG_PADRAO);
    expect(mensagemDoLembrete(l!, { modeloAniversario: '{tutor}|{pet}|{data}|{idade}', modeloVacina: '' })).toBe('Ana|Thor|28/10|3 anos');
  });

  it('vacina atrasada usa o modelo de atrasada; sem ele, o de vacina', () => {
    const vacinas = montarLembretes(dados, new Set(), hoje, CONFIG_PADRAO).filter((l) => l.tipo === 'vacina');
    const atrasada = vacinas.find((l) => l.diasAte < 0)!;
    const emDia = vacinas.find((l) => l.diasAte >= 0)!;
    const modelos = { modeloAniversario: '', modeloVacina: 'prevista {vacina}', modeloVacinaAtrasada: 'atrasada {vacina}' };
    expect(mensagemDoLembrete(atrasada, modelos)).toBe(`atrasada ${atrasada.vacina}`);
    expect(mensagemDoLembrete(emDia, modelos)).toBe(`prevista ${emDia.vacina}`);
    expect(mensagemDoLembrete(atrasada, { ...modelos, modeloVacinaAtrasada: '' })).toBe(`prevista ${atrasada.vacina}`);
  });

  it('vacina atrasada some quando passa do limite de atraso', () => {
    const com = montarLembretes(dados, new Set(), hoje, CONFIG_PADRAO).filter((l) => l.tipo === 'vacina' && l.diasAte < 0);
    const sem = montarLembretes(dados, new Set(), hoje, { ...CONFIG_PADRAO, diasAtrasoVacina: 0 }).filter((l) => l.diasAte < 0);
    expect(com.length).toBeGreaterThan(0);
    expect(sem).toEqual([]);
  });
});
