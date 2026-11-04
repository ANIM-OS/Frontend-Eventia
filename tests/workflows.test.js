import { test } from 'node:test'
import assert from 'node:assert/strict'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { accessStatus, canEditEvent, canPublishEvent, canShowTicketQr, enrichTickets } from '../src/eventLogic.js'
import { ensureSuccess, jsonBody } from '../src/http.js'
import { aplicarCupos } from '../src/aforo.js'

const event = { eventoId: 12, estado: 'PUBLICADO', estadoModeracion: 'CONFORME', fechaInicio: '2026-10-30T01:00:00Z', fechaFin: '2026-10-30T05:00:00Z' }

test('el ingreso se habilita en el día de Lima, aunque en UTC ya sea el día siguiente', () => {
  assert.equal(accessStatus(event, new Date('2026-10-29T15:00:00Z')).allowed, true)
  assert.equal(accessStatus(event, new Date('2026-10-29T04:59:59Z')).allowed, false)
  assert.equal(accessStatus(event, new Date('2026-10-29T05:00:00Z')).allowed, true)
})
test('no se permite ingresar a borradores, eventos cancelados, suspendidos o terminados', () => {
  const now = new Date('2026-10-29T15:00:00Z')
  for (const estado of ['BORRADOR', 'CANCELADO']) assert.equal(accessStatus({ ...event, estado }, now).allowed, false)
  assert.equal(accessStatus({ ...event, estadoModeracion: 'DESACTIVADO' }, now).allowed, false)
  assert.equal(accessStatus(event, new Date(event.fechaFin)).allowed, false)
  assert.equal(accessStatus({ ...event, fechaFin: '' }, now).allowed, false)
  assert.equal(accessStatus(null, now).allowed, false)
})
test('un evento de enero no habilita ingreso por comparar mal mes y año', () => {
  const nextYear = { ...event, fechaInicio: '2027-01-01T17:00:00Z', fechaFin: '2027-01-02T00:00:00Z' }
  assert.equal(accessStatus(nextYear, new Date('2026-12-31T20:00:00Z')).allowed, false)
})
test('publicar y editar respetan el ciclo de vida del evento', () => {
  const now = new Date('2026-10-28T15:00:00Z')
  assert.equal(canPublishEvent({ ...event, estado: 'BORRADOR' }, now), true)
  assert.equal(canPublishEvent(event, now), false)
  assert.equal(canPublishEvent({ ...event, estado: 'BORRADOR' }, new Date(event.fechaInicio)), false)
  assert.equal(canEditEvent({ ...event, estado: 'CANCELADO' }), false)
  assert.equal(canEditEvent({ ...event, finalizado: true }), false)
  assert.equal(canEditEvent(null), false)
})
test('las entradas se vinculan a su compra sin mezclar titulares ni modificar la respuesta original', () => {
  const tickets = [{ entradaId: 1, estado: 'VALIDA', titularNombre: 'Ana' }, { entradaId: 2, estado: 'UTILIZADA' }]
  const result = enrichTickets(tickets, [{ compraId: 8, eventoTitulo: 'Concierto', estado: 'CONFIRMADA', entradas: [{ entradaId: 1 }] }])
  assert.equal(result[0].compraId, 8)
  assert.equal(result[0].titularNombre, 'Ana')
  assert.equal(result[1].compraId, undefined)
  assert.equal(tickets[0].compraId, undefined)
  assert.equal(canShowTicketQr(result[0]), true)
  assert.equal(canShowTicketQr(result[1]), false)
  assert.equal(canShowTicketQr({ estado: 'VALIDA', compraEstado: 'CANCELADA' }), false)
})
test('POST devuelve los datos JSON del perfil y no un objeto Response', async () => {
  const response = new Response(JSON.stringify({ usuarioId: 4, roles: ['ASISTENTE', 'ORGANIZADOR'] }), { status: 201 })
  const profile = await jsonBody(await ensureSuccess(response))
  assert.equal(profile.usuarioId, 4)
  assert.ok(profile.roles.includes('ORGANIZADOR'))
  assert.equal(await jsonBody(new Response(null, { status: 204 })), null)
})
test('los errores conservan el estado HTTP: una cuenta bloqueada no se trata como un perfil inexistente', async () => {
  for (const status of [401, 403, 404]) await assert.rejects(ensureSuccess(new Response(JSON.stringify({ mensaje: 'Acceso denegado' }), { status })), error => error.status === status && error.message === 'Acceso denegado')
  await assert.rejects(ensureSuccess(new Response(JSON.stringify({ errors: { Fecha: ['Revisa las fechas.'], Nombre: ['Completa el nombre.'] } }), { status: 400 })), /Revisa las fechas\. Completa el nombre\./)
})
test('el QR mostrado en la entrada se puede decodificar con el mismo lector de fotos', () => {
  const token = '0123456789ABCDEF'.repeat(4), matrix = QRCode.create(token).modules
  const scale = 6, margin = 4, size = (matrix.size + margin * 2) * scale
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255)
  for (let row = 0; row < matrix.size; row++) for (let col = 0; col < matrix.size; col++) {
    if (!matrix.get(row, col)) continue
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const index = (((row + margin) * scale + y) * size + (col + margin) * scale + x) * 4
      pixels[index] = 0; pixels[index + 1] = 63; pixels[index + 2] = 125
    }
  }
  assert.equal(jsQR(pixels, size, size)?.data, token)
})

test('el aviso de cupos en vivo actualiza solo el evento indicado y bloquea la compra si se agota', () => {
  const lista = [{ eventoId: 1, aforoTotal: 4, entradasVendidas: 3, cuposDisponibles: 1, agotado: false, disponibleParaCompra: true }, { eventoId: 2, cuposDisponibles: 10 }]
  const aviso = { eventoId: 1, aforoTotal: 4, entradasVendidas: 4, cuposDisponibles: 0, agotado: true }
  const cambiados = lista.filter(event => aplicarCupos(event, aviso))
  assert.equal(cambiados.length, 1)
  assert.equal(lista[0].cuposDisponibles, 0)
  assert.equal(lista[0].disponibleParaCompra, false)
  assert.equal(lista[1].cuposDisponibles, 10)
  assert.equal(aplicarCupos(null, aviso), false)
})
