import { describe, test, expect } from 'vitest'
import { ordenarAlvosPorInicio } from '@/lib/intercecoes'

const alvo = (nome: string, ...inicios: string[]) => ({
  nome,
  linhas: inicios.map((d) => ({ dataInicio: new Date(d) })),
})

describe('ordenarAlvosPorInicio', () => {
  test('ordena pela linha mais antiga de cada alvo', () => {
    const r = ordenarAlvosPorInicio([
      alvo('Zé', '2026-03-01'),
      alvo('Ana', '2026-05-01', '2026-02-01'),
      alvo('Bruno', '2026-04-01'),
    ])
    expect(r.map((a) => a.nome)).toEqual(['Ana', 'Zé', 'Bruno'])
  })

  test('alvos sem linhas vão para o fim; empate por nome', () => {
    const r = ordenarAlvosPorInicio([
      alvo('Sem linhas B'),
      alvo('Carlos', '2026-01-01'),
      alvo('Sem linhas A'),
      alvo('Álvaro', '2026-01-01'),
    ])
    expect(r.map((a) => a.nome)).toEqual(['Álvaro', 'Carlos', 'Sem linhas A', 'Sem linhas B'])
  })

  test('não altera o array original', () => {
    const lista = [alvo('B', '2026-02-01'), alvo('A', '2026-01-01')]
    ordenarAlvosPorInicio(lista)
    expect(lista.map((a) => a.nome)).toEqual(['B', 'A'])
  })
})
