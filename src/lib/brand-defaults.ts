/**
 * Defaults da identidade visual / textual da app — ponto único onde a marca
 * "GPI" está codificada. Quando `ConfiguracaoSistema` tem null numa coluna
 * brand*, é este o valor usado.
 *
 * Este ficheiro NÃO importa `server-only` propositadamente: é também
 * consumido pelo `BrandProvider` (componente cliente) como fallback do
 * contexto. A leitura efetiva da BD vive em `./brand.ts` (esse sim
 * server-only).
 */
export const BRAND_DEFAULTS = {
  appName: 'GPI',
  appShortName: 'GPI',
  appDescription: 'Gestão de Processos de Investigação',
  manifestDescription: 'Plataforma de gestão de inquéritos criminais',
  pdfFooterText: 'GPI · Gestão de Processos de Investigação',
  logoLightFilename: null as string | null,
  logoDarkFilename: null as string | null,
  faviconFilename: null as string | null,
  brandUpdatedAt: null as Date | null,
} as const

export type Brand = {
  appName: string
  appShortName: string
  appDescription: string
  manifestDescription: string
  pdfFooterText: string
  logoLightFilename: string | null
  logoDarkFilename: string | null
  faviconFilename: string | null
  brandUpdatedAt: Date | null
}
