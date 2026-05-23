/**
 * Validação de magic bytes para uploads de branding. Confirma que o
 * conteúdo de um buffer corresponde ao MIME declarado pelo cliente —
 * rejeita ficheiros mal classificados (e.g. .svg renomeado .png) que
 * poderiam ser usados para iludir filtros de MIME.
 *
 * Documentação dos magic bytes:
 *   PNG: 89 50 4E 47 0D 0A 1A 0A
 *   JPEG: FF D8 FF
 *   WEBP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50  (RIFF...WEBP)
 *   SVG: texto começa por '<?xml' ou '<svg'
 *   ICO: 00 00 01 00
 */
export function validateImageMagic(buf: Buffer, mime: string): boolean {
  if (buf.length < 4) return false
  switch (mime) {
    case 'image/png':
      return (
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47
      )
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
    case 'image/webp':
      return (
        buf.length >= 12 &&
        buf.toString('ascii', 0, 4) === 'RIFF' &&
        buf.toString('ascii', 8, 12) === 'WEBP'
      )
    case 'image/svg+xml': {
      const head = buf.toString('utf8', 0, Math.min(buf.length, 256)).trim().toLowerCase()
      return head.startsWith('<?xml') || head.startsWith('<svg')
    }
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon':
      return buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00
  }
  return false
}
