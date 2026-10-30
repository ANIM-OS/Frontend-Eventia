export const isPublished = (event) => ['PUBLICADO', 'ACTIVO'].includes(event?.estado) && event?.estadoModeracion !== 'DESACTIVADO'
export const canEditEvent = (event) => Boolean(event && event.estado !== 'CANCELADO' && event.estadoModeracion !== 'DESACTIVADO' && !event.finalizado)
export const canPublishEvent = (event, now = new Date()) => event?.estado === 'BORRADOR' && canEditEvent(event) && new Date(event.fechaInicio) > now

const eventDay = (date) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function accessStatus(event, now = new Date()) {
  if (!event) return { allowed: false, message: 'Selecciona el evento que estás recibiendo.' }
  if (!isPublished(event)) return { allowed: false, message: 'El control de acceso requiere un evento publicado y habilitado.' }
  const start = new Date(event.fechaInicio), end = new Date(event.fechaFin)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return { allowed: false, message: 'Este evento no tiene un horario válido.' }
  if (end <= now || event.finalizado) return { allowed: false, message: 'El evento terminó. Ya no se registran ingresos.' }
  if (eventDay(start) > eventDay(now)) return { allowed: false, message: 'El registro de ingreso se habilita el día del evento.' }
  return { allowed: true, message: 'Listo para recibir asistentes. Cada validación confirma un ingreso.' }
}

export function enrichTickets(tickets, purchases) {
  const details = new Map()
  for (const purchase of purchases) for (const ticket of purchase.entradas || []) details.set(ticket.entradaId, { compraId: purchase.compraId, eventoTitulo: purchase.eventoTitulo, fechaInicio: purchase.fechaInicio, compraEstado: purchase.estado })
  return tickets.map(ticket => ({ ...ticket, ...details.get(ticket.entradaId) }))
}
export const canShowTicketQr = (ticket) => ticket?.estado === 'VALIDA' && (!ticket.compraEstado || ticket.compraEstado === 'CONFIRMADA')
