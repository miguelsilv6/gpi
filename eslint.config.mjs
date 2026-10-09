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
      // Regra "consultiva" do React 19: sinaliza setState dentro de efeitos.
      // O código usa o padrão clássico de carregar dados num useEffect (fetch ao
      // montar, re-sincronizar estado quando muda uma prop, reset ao fechar um
      // diálogo) — é válido e funciona; migrar tudo para Suspense/`use()`/`key`
      // é um refactor transversal. Fica como aviso (visível, não bloqueia) e o
      // CI impede que o número de avisos aumente (`--max-warnings`).
      'react-hooks/set-state-in-effect': 'warn',
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
