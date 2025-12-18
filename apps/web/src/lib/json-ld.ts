/**
 * Serializa dados para um bloco `<script type="application/ld+json">`.
 *
 * `JSON.stringify` não escapa `<`, `>` nem `&`, então um campo de produto ou
 * categoria com `</script>` romperia o bloco e injetaria HTML/JS na página
 * (XSS armazenado). Escapamos esses caracteres — e os separadores de linha
 * U+2028/U+2029, inválidos em string JS — para a saída ser sempre inerte.
 */
const SEP_LINHA = String.fromCharCode(0x2028);
const SEP_PARAGRAFO = String.fromCharCode(0x2029);

export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(SEP_LINHA, '\\u2028')
    .replaceAll(SEP_PARAGRAFO, '\\u2029');
}
