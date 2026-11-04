import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

// US-09: cupos en tiempo real. La API envía "cuposActualizados" por SignalR (/hubs/aforo)
// después de cada compra o cambio de aforo; aquí se reparte el aviso a quien esté escuchando.
const base = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const hubUrl = base.replace(/\/api$/, '') + '/hubs/aforo'

const listeners = new Set()
let connection = null

function start() {
  if (connection) return
  connection = new HubConnectionBuilder()
    .withUrl(hubUrl)
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()
  connection.on('cuposActualizados', (data) => listeners.forEach(listener => listener(data)))
  // Si no conecta (API apagada), la app sigue funcionando: los cupos se ven al recargar la lista
  connection.start().catch(() => { connection = null; setTimeout(() => { if (listeners.size) start() }, 10000) })
}

/** Escucha los cambios de cupos. Devuelve una función para dejar de escuchar. */
export function onCuposActualizados(listener) {
  listeners.add(listener)
  start()
  return () => listeners.delete(listener)
}

/** Aplica el aviso a un evento de la lista (mismo formato que devuelve la API). */
export function aplicarCupos(event, { eventoId, aforoTotal, entradasVendidas, cuposDisponibles, agotado }) {
  if (!event || event.eventoId !== eventoId) return false
  event.aforoTotal = aforoTotal
  event.entradasVendidas = entradasVendidas
  event.cuposDisponibles = cuposDisponibles
  event.agotado = agotado
  if (agotado) event.disponibleParaCompra = false
  return true
}
