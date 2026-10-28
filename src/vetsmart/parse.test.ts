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
    expect(interpretarPaciente({ objectId: 'p4', name: 'X', deceased: '1' })).toBeNull();
    expect(interpretarPaciente({ objectId: 'p6', name: 'X', deceased: '0' })).not.toBeNull();
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
  const hoje = '2026-10-28';
  const v = (id: string, nome: string, dia: string, extra: Record<string, unknown> = {}): ObjetoParse => ({
    objectId: id,
    patient: { __type: 'Pointer', className: 'Patient', objectId: 'p1' },
    patientId: 'p1',
    vaccine: 'Marca Fictícia',
    vaccineType: nome,
    documentDate: data(`${dia}T03:00:00Z`),
    ...extra,
  });

  it('dose com data a partir de hoje é a próxima dose', () => {
    const lista = interpretarVacinas(
      [
        v('a', 'V10', '2025-10-30'), // aplicada
        v('b', 'V10', '2026-11-02', { parentVaccine: { objectId: 'a' } }), // programada
        v('c', 'V10', '2027-11-02'), // programada mais distante
        v('d', 'Antirrábica', '2026-10-28'), // hoje
        v('e', 'Giárdia', '2026-03-01'), // passado
      ],
      hoje,
    );
    expect(lista).toEqual([
      { id: 'b', pacienteId: 'p1', nome: 'V10', proximaDose: '2026-11-02' },
      { id: 'd', pacienteId: 'p1', nome: 'Antirrábica', proximaDose: '2026-10-28' },
    ]);
  });
  it('respeita ignoreReminder e isDeleted', () => {
    expect(interpretarVacinas([v('a', 'V10', '2026-11-02', { ignoreReminder: true }), v('b', 'V8', '2026-11-02', { isDeleted: true })], hoje)).toEqual([]);
  });
  it('isReminder: programada vale mesmo atrasada, aplicada nunca', () => {
    const lista = interpretarVacinas(
      [
        v('a', 'V10', '2026-10-01', { isReminder: true }), // programada e atrasada
        v('b', 'V10', '2027-10-01', { isReminder: true }), // programada mais distante
        v('c', 'Antirrábica', '2026-12-01', { isReminder: false }), // aplicada (data futura por engano)
      ],
      hoje,
    );
    expect(lista).toEqual([{ id: 'a', pacienteId: 'p1', nome: 'V10', proximaDose: '2026-10-01' }]);
  });
  it('usa a marca quando falta o tipo e aceita campo explícito de próxima dose', () => {
    const [m] = interpretarVacinas([{ objectId: 'g', patientId: 'p8', vaccine: 'Marca Fictícia', documentDate: data('2027-01-01T03:00:00Z') }], hoje);
    expect(m).toMatchObject({ nome: 'Marca Fictícia' });
    const [x] = interpretarVacinas([{ objectId: 'f', patientId: 'p9', vaccineType: 'V4 felina', nextDate: data('2027-05-05T03:00:00Z') }], hoje);
    expect(x).toMatchObject({ nome: 'V4 felina', pacienteId: 'p9', proximaDose: '2027-05-05' });
    expect(campoProximaDose({ documentDate: data('2026-01-10T03:00:00Z') })).toBeNull();
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
      clinicClasse: 'Clinic',
      incluirVacina: 'vaccine',
    });
  });
  it('ignora outras chamadas', () => {
    expect(sessaoDoCorpo('https://exemplo.com/parse/classes/X', '{"_SessionToken":"a","_ApplicationId":"b"}')).toBeNull();
    expect(sessaoDoCorpo(url, '{"where":{}}')).toBeNull();
    expect(sessaoDoCorpo(url, undefined)).toBeNull();
  });
});
