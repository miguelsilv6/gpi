/**
 * Utilitário de cliente para remover a subscrição push deste browser — no
 * servidor (`DELETE /api/push`) e no `PushManager`. Best-effort e seguro em
 * qualquer contexto (no-op se não suportado ou sem subscrição).
 *
 * Usado no opt-out do Perfil e, criticamente, no logout: em dispositivos
 * partilhados, deixar a subscrição ativa faria com que as notificações do
 * utilizador que saiu continuassem a chegar ao aparelho (fuga de informação).
 * A remoção no servidor tem de correr enquanto a sessão ainda existe — chamar
 * antes de `signOut()`.
 */
export async function unsubscribePushThisDevice(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    await fetch('/api/push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  } catch {
    // best-effort — nunca deve impedir o logout
  }
}
