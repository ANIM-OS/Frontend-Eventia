import { auth } from './firebase'
import { ensureSuccess, jsonBody } from './http'

const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const user = auth?.currentUser
  if (user) headers.set('Authorization', `Bearer ${await user.getIdToken()}`)
  if (options.body !== undefined && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    headers,
    body: options.body === undefined || options.body instanceof FormData
      ? options.body
      : JSON.stringify(options.body),
  })
  await ensureSuccess(response)
  return response.status === 204 ? null : response
}

export async function get(path) { return jsonBody(await request(path)) }
export async function send(path, method, body) { return jsonBody(await request(path, { method, body })) }

export async function put(path, body = undefined) { return send(path, 'PUT', body) }
export async function post(path, body) { return send(path, 'POST', body) }
export async function download(path) {
  const response = await request(path)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = response.headers.get('content-disposition')?.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i)?.[1] || path.split('/').pop()
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const query = (values) => {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined && value !== false) params.set(key, value)
    else if (value === true) params.set(key, 'true')
  })
  return params.toString()
}

export const api = {
  chat: (message, history = []) => post('/Chat/chat', { message, history }),
  categorias: () => get('/Categoria'), categoria: (id) => get(`/Categoria/${id}`), populares: (cantidad = 4) => get(`/Categoria/populares?cantidad=${cantidad}`),
  eventos: (filters = {}) => get(`/Evento?${query(filters)}`), evento: (id) => get(`/Evento/${id}`),
  recomendados: (cantidad = 6) => get(`/Evento/recomendados?cantidad=${cantidad}`),
  misEventos: () => get('/Evento/mis-eventos'), crearEvento: (data) => post('/Evento', data),
  actualizarEvento: (id, data) => put(`/Evento/${id}`, data), publicarEvento: (id) => put(`/Evento/${id}/publicar`), cancelarEvento: (id) => put(`/Evento/${id}/cancelar`),
  perfil: () => get('/Usuario/me'), registrar: (data) => post('/Usuario/registro', data),
  activarOrganizador: () => post('/Usuario/me/rol-organizador', {}), cambiarRol: (rol) => post('/Usuario/me/cambiar-rol', { rol }),
  intereses: () => get('/Usuario/me/intereses'), actualizarIntereses: (categoriaIds) => put('/Usuario/me/intereses', { categoriaIds }),
  comprar: (data) => post('/Compra', data), compras: () => get('/Compra/mis-compras'), compra: (id) => get(`/Compra/${id}`),
  entradas: () => get('/Entrada/mis-entradas'), validarEntrada: (data) => post('/Entrada/validar', data),
  ventas: (filters = {}) => get(`/Venta/panel?${query(filters)}`), exportarVentas: (format, filters = {}) => download(`/Venta/exportar/${format}?${query(filters)}`),
  resenasEvento: (id) => get(`/Resena/evento/${id}`), misResenas: () => get('/Resena/mias'), pendientesResena: () => get('/Resena/pendientes'), crearResena: (data) => post('/Resena', data),
  notificaciones: () => get('/Notificacion'), leerNotificacion: (id) => put(`/Notificacion/${id}/leer`), leerTodas: () => put('/Notificacion/leer-todas'),
  modPanel: () => get('/Moderacion/panel'), modEventos: (params = {}) => get(`/Moderacion/eventos?${query(params)}`), modEvento: (id) => get(`/Moderacion/eventos/${id}`),
  moderarEvento: (id, body) => put(`/Moderacion/eventos/${id}/moderar`, body), reportarEvento: (id, motivo) => post(`/Moderacion/eventos/${id}/reportar`, { motivo }),
  reportes: (estado = '') => get(`/Moderacion/reportes?${query({ estado })}`), resolverReporte: (id, body) => put(`/Moderacion/reportes/${id}/resolver`, body),
  usuarios: (params = {}) => get(`/Moderacion/usuarios?${query(params)}`), cambiarEstadoUsuario: (id, body) => put(`/Moderacion/usuarios/${id}/estado`, body), verificarUsuario: (id) => put(`/Moderacion/usuarios/${id}/verificar`),
  auditoria: (params = {}) => get(`/Moderacion/auditoria?${query(params)}`), exportarAuditoria: () => download('/Moderacion/auditoria/exportar'),
  reglas: () => get('/Moderacion/reglas'), crearRegla: (body) => post('/Moderacion/reglas', body), toggleRegla: (id, activa) => put(`/Moderacion/reglas/${id}/activa?activa=${activa}`),
}
