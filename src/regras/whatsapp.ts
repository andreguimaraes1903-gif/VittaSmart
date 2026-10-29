/** Normaliza telefone brasileiro para 55 + DDD + número. Devolve null se não parecer válido. */
export function normalizarWhatsapp(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  let d = telefone.replace(/\D/g, '');
  d = d.replace(/^0+/, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return null;
}

/**
 * Usa api.whatsapp.com direto: o redirecionamento do wa.me troca emojis
 * (caracteres fora do BMP) por "�".
 */
export function linkWhatsapp(numero: string, mensagem: string): string {
  return `https://api.whatsapp.com/send/?phone=${numero}&text=${encodeURIComponent(mensagem)}`;
}
