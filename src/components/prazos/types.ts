/** Shape passed from the server page to client components. */
export interface PrazoItem {
  id: string
  descricao: string
  quantidade: number | null
  dataPrazo: Date | string
  alertaDias1: number | null
  alertaDias2: number | null
  alerta1Enviado: boolean
  alerta2Enviado: boolean
  realizadaPor: { id: string; nome: string }
  inquerito: {
    id: string
    nuipc: string
    brigada: { id: string; nome: string } | null
    estado: {
      id: string
      codigo: string
      nome: string
      cor: string | null
      terminal: boolean
    }
  }
}
