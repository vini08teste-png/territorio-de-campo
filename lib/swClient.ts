// Ponte com o service worker (public/sw.js). Fica separado do componente de
// registro pra poder ser chamado de qualquer lugar (ex.: logout) sem importar
// código de UI.

// Chamado no logout pra o próximo usuário não ver, offline, dados do anterior.
export function limparCacheDados() {
  try {
    navigator.serviceWorker?.controller?.postMessage('LIMPAR_DADOS')
  } catch { /* sem SW ativo, nada a limpar */ }
  try { localStorage.removeItem('tc_usuario') } catch { /* ignora */ }
}
