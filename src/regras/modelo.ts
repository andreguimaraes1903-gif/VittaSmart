export type CamposModelo = Partial<Record<'tutor' | 'pet' | 'data' | 'idade' | 'vacina' | 'motivo', string>>;

/** Substitui {campo} pelos valores; campos ausentes ficam vazios. */
export function preencherModelo(modelo: string, campos: CamposModelo): string {
  return modelo.replace(/\{(\w+)\}/g, (_, chave: string) => campos[chave as keyof CamposModelo] ?? '');
}

export function textoIdade(anos: number): string {
  return anos === 1 ? '1 ano' : `${anos} anos`;
}

/** ["a", "b", "c"] → "a, b e c". */
export function juntarLista(itens: string[]): string {
  return itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : (itens[0] ?? '');
}

/** "Maria Souza" → "Maria". */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
