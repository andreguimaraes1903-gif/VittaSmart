import { describe, expect, it } from 'vitest';
import { campoProximaDose, dataParse, interpretarPaciente, interpretarTutor, interpretarVacinas, type ObjetoParse } from './parse';
import { sessaoDoCorpo } from './sessao';

const data = (iso: string) => ({ __type: 'Date', iso });

describe('interpretarPaciente', () => {
  it('converte o objeto Patient', () => {
    expect(
      interpretarPaciente({
        objectId: 'p1',
        name: ' Thor ',
        specie: 'Canina',
        birthdate: data('2020-03-05T03:00:00.000Z'),
        owner: { __type: 'Pointer', className: 'Owner', objectId: 'o1' },
        deceased: 'false',
        isDeleted: false,
      }),
    ).toEqual({ id: 'p1', nome: 'Thor', especie: 'Canina', nascimento: '2020-03-05', tutorId: 'o1' });
  });
  it('usa ownerId quando não há ponteiro e aceita sem nascimento', () => {
    expect(interpretarPaciente({ objectId: 'p2', name: 'Mel', ownerId: 'o2' })).toMatchObject({ nascimento: null, tutorId: 'o2' });
  });
  it('descarta falecidos e excluídos', () => {
    expect(interpretarPaciente({ objectId: 'p3', name: 'X', deceased: 'true' })).toBeNull();
    expect(interpretarPaciente({ objectId: 'p4', name: 'X', deceased: 'Sim' })).toBeNull();
    expect(interpretarPaciente({ objectId: 'p5', name: 'X', isDeleted: true })).toBeNull();
  });
});

describe('interpretarTutor', () => {
  it('pega nome e telefone', () => {
    expect(interpretarTutor({ objectId: 'o1', name: 'Ana', phone: '(11) 91234-5678' })).toEqual({ id: 'o1', nome: 'Ana', telefone: '(11) 91234-5678' });
    expect(interpretarTutor({ objectId: 'o2', name: 'Bia', phone: '' })?.telefone).toBeNull();
  });
});

describe('vacinas', () => {
  it('acha o campo de próxima dose pelo nome', () => {
    expect(campoProximaDose({ applicationDate: data('2026-01-10T03:00:00Z'), nextApplicationDate: data('2027-01-10T03:00:00Z') })).toBe('2027-01-10');
    expect(campoProximaDose({ revaccinationDate: '10/01/2027' })).toBe('2027-01-10');
    expect(campoProximaDose({ applicationDate: data('2026-01-10T03:00:00Z') })).toBeNull();
  });
  it('fica só com a dose mais recente de cada vacina do paciente', () => {
    const v = (id: string, nome: string, aplicada: string, proxima?: string): ObjetoParse => ({
      objectId: id,
      patient: { __type: 'Pointer', className: 'Patient', objectId: 'p1' },
      name: nome,
      applicationDate: data(`${aplicada}T03:00:00Z`),
      ...(proxima ? { nextApplicationDate: data(`${proxima}T03:00:00Z`) } : {}),
    });
    const lista = interpretarVacinas([
      v('a', 'V10', '2025-01-01', '2026-01-01'), // já cumprida pela dose seguinte
      v('b', 'V10', '2026-01-01', '2027-01-01'),
      v('c', 'Antirrábica', '2026-02-01', '2027-02-01'),
      v('d', 'Giárdia', '2026-03-01'), // sem próxima dose
    ]);
    expect(lista).toEqual([
      { id: 'b', pacienteId: 'p1', nome: 'V10', proximaDose: '2027-01-01' },
      { id: 'c', pacienteId: 'p1', nome: 'Antirrábica', proximaDose: '2027-02-01' },
    ]);
  });
  it('lê o nome dentro de ponteiro incluído', () => {
    const [x] = interpretarVacinas([{ objectId: 'e', patientId: 'p9', vaccine: { name: 'V4 felina' }, nextDate: data('2027-05-05T03:00:00Z') }]);
    expect(x).toMatchObject({ nome: 'V4 felina', pacienteId: 'p9' });
  });
  it('dataParse aceita formatos variados', () => {
    expect(dataParse(data('2020-03-05T00:00:00.000Z'))).toBe('2020-03-05');
    expect(dataParse('2020-03-05')).toBe('2020-03-05');
    expect(dataParse(null)).toBeNull();
  });
});

describe('sessaoDoCorpo', () => {
  const url = 'https://parse.vetsmart.com.br/parse/classes/Vaccine';
  it('extrai credenciais, clínica e include', () => {
    const corpo = JSON.stringify({
      where: { clinic: { __type: 'Pointer', className: 'Clinic', objectId: 'Pj17tDafNx' } },
      include: 'vaccine',
      _method: 'GET',
      _ApplicationId: 'app',
      _ClientVersion: 'js1.0',
      _InstallationId: 'inst',
      _SessionToken: 'r:tok',
    });
    expect(sessaoDoCorpo(url, corpo)).toEqual({
      servidor: 'https://parse.vetsmart.com.br/parse',
      appId: 'app',
      token: 'r:tok',
      installationId: 'inst',
      clientVersion: 'js1.0',
      clinicId: 'Pj17tDafNx',
      incluirVacina: 'vaccine',
    });
  });
  it('ignora outras chamadas', () => {
    expect(sessaoDoCorpo('https://exemplo.com/parse/classes/X', '{"_SessionToken":"a","_ApplicationId":"b"}')).toBeNull();
    expect(sessaoDoCorpo(url, '{"where":{}}')).toBeNull();
    expect(sessaoDoCorpo(url, undefined)).toBeNull();
  });
});
