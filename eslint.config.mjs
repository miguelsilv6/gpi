import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Parâmetros/variáveis com prefixo "_" são intencionalmente não usados
      // (convenção já usada no código: _req, _brigadaId, _email, ...).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    rules: {
      // Regra do React 19: sinaliza setState síncrono dentro de efeitos. O código
      // carrega dados / ressincroniza estado através de `useDeferredEffect`
      // (src/hooks), que corre o corpo de forma assíncrona. Mantém-se como
      // aviso; o CI não admite nenhum (`--max-warnings=0`).
      'react-hooks/set-state-in-effect': 'warn',
      // Valida também as dependências de useDeferredEffect (src/hooks).
      'react-hooks/exhaustive-deps': ['warn', { additionalHooks: '(useDeferredEffect)' }],
    },
  },
  {
    // Route handlers (ex.: PDFs com @react-pdf/renderer) constroem JSX fora de
    // um render do React: a regra dos error boundaries não se aplica.
    files: ['src/app/api/**/*.tsx'],
    rules: { 'react-hooks/error-boundaries': 'off' },
  },
  globalIgnores([
    // Defaults do eslint-config-next
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Código gerado / artefactos
    'src/generated/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),
])

export default eslintConfig
