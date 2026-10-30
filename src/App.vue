<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth'
import { api } from './api'
import { auth, firebaseConfigured } from './firebase'
import QrCode from './QrCode.vue'
import AppIcon from './AppIcon.vue'
import EventCard from './EventCard.vue'
import EventAssistant from './EventAssistant.vue'
import AccessControl from './AccessControl.vue'
import { canEditEvent, canPublishEvent, canShowTicketQr, enrichTickets, isPublished } from './eventLogic'

const sections = [
  { id: 'explorar', label: 'Explorar', icon: '⌕' }, { id: 'entradas', label: 'Mis entradas', icon: '▤' },
  { id: 'organizar', label: 'Mis eventos', icon: '＋' }, { id: 'accesos', label: 'Control de acceso', icon: '▦' }, { id: 'cuenta', label: 'Mi cuenta', icon: '◉' },
  { id: 'resenas', label: 'Reseñas', icon: '☆' }, { id: 'avisos', label: 'Notificaciones', icon: '♧' },
  { id: 'moderacion', label: 'Moderación', icon: '⌘' },
]
const active = ref('explorar')
const authMode = ref('login'); const firebaseUser = ref(auth?.currentUser || null); const appDataLoaded = ref(false)
const events = ref([]); const categories = ref([]); const popularCategories = ref([])
const profile = ref(null); const activeRole = ref('ASISTENTE'); const interests = ref([])
const tickets = ref([]); const purchases = ref([]); const pendingReviews = ref([]); const reviews = ref([])
const recommendations = ref([]); const recommendationCaption = ref(''); const profileMenu = ref(null); const assistantOpen = ref(false)
const accessEventId = ref(''); const organizerView = ref('eventos'); const selectedTicket = ref(null); const selectedPurchaseId = ref(null)
const profileLoading = ref(true); const profileLoadError = ref(''); const needsProfile = ref(false)
const selectedCategory = ref(null); const modEventDetail = ref(null)
const notifications = ref([]); const sales = ref(null); const ownEvents = ref([])
const modPanel = ref(null); const modEvents = ref([]); const reports = ref([]); const users = ref([]); const audit = ref([]); const rules = ref([])
const query = reactive({ texto: '', categoriaId: '', ubicacion: '', fechaDesde: '', fechaHasta: '', soloDisponibles: true, pagina: 1, tamanoPagina: 12 })
const eventTotal = ref(0); const eventDetail = ref(null); const reviewSummary = ref(null); const message = ref(''); const pendingActions = ref(0); const busy = computed(() => pendingActions.value > 0)
let eventsRequest = 0; let profileRequest = 0; let detailRequest = 0; let moderationRequest = 0; let recommendationRequest = 0
const authForm = reactive({ email: '', password: '', nombre: '' }); const showPassword = ref(false); const reviewDrafts = reactive({})
const eventForm = reactive({ eventoId: 0, categoriaId: '', nombre: '', descripcion: '', imagenUrl: '', fechaInicio: '', fechaFin: '', sede: '', direccion: '', departamento: 'Lima', provincia: 'Lima', distrito: '', aforoTotal: 50, precio: 0 })
const checkout = reactive({ eventoId: 0, cantidad: 1, metodoPago: 'YAPE', asistentes: [{ titularNombre: '', titularDocumento: '', tipoAcceso: 'GENERAL' }] })
const checkoutOpen = ref(false); const reportReason = ref(''); const showReport = ref(false); const modTab = ref('eventos'); const modStatus = ref('EN_REVISION'); const modSearch = ref('')
const detailQuantity = ref(1)
const salesFilter = reactive({ periodo: 'TODO', fechaDesde: '', fechaHasta: '' })
const isAdmin = computed(() => profile.value?.roles?.includes('ADMINISTRADOR'))
const isOrganizer = computed(() => profile.value?.roles?.includes('ORGANIZADOR'))
const hasFirebaseAccount = computed(() => Boolean(firebaseUser.value))
const navSections = computed(() => sections.filter(item => (item.id !== 'moderacion' || isAdmin.value) && (item.id !== 'accesos' || isOrganizer.value)))
const ticketList = computed(() => enrichTickets(tickets.value, purchases.value).filter(ticket => !selectedPurchaseId.value || ticket.compraId === selectedPurchaseId.value))
const totalPages = computed(() => Math.max(1, Math.ceil(eventTotal.value / query.tamanoPagina)))

function notify(text) { message.value = text; window.clearTimeout(notify.timer); notify.timer = window.setTimeout(() => { message.value = '' }, 3600) }
async function action(work, success = 'Listo.', sessionSensitive = true) {
  const uid = auth?.currentUser?.uid
  pendingActions.value++
  try {
    const result = await work()
    if (sessionSensitive && uid !== auth?.currentUser?.uid) return false
    if (success) notify(success)
    return result
  } catch (error) {
    if (!sessionSensitive || uid === auth?.currentUser?.uid) notify(error.message || 'No se pudo completar la solicitud.')
    return false
  } finally { pendingActions.value-- }
}
function items(response, key) { return Array.isArray(response) ? response : response?.[key] || [] }
async function loadEvents(reset = false) {
  if (query.fechaDesde && query.fechaHasta && query.fechaDesde > query.fechaHasta) return notify('La fecha final debe ser posterior a la inicial.')
  if (reset) query.pagina = 1
  const requestId = ++eventsRequest
  const result = await action(() => api.eventos({ ...query }), '')
  if (result && requestId === eventsRequest) { events.value = items(result, 'eventos'); eventTotal.value = result.total || 0 }
}
async function changePage(delta) {
  const page = query.pagina + delta
  if (page < 1 || page > totalPages.value || busy.value) return
  query.pagina = page; await loadEvents()
}
async function loadRecommendations() {
  const requestId = ++recommendationRequest
  const result = await action(() => api.recomendados(3), '')
  if (result && requestId === recommendationRequest) { recommendations.value = items(result, 'eventos'); recommendationCaption.value = result.criterio || 'Eventos para tu próxima experiencia.' }
}
async function filterByCategory(id) {
  query.categoriaId = id || ''; selectedCategory.value = null
  const requests = [loadEvents(true)]
  if (id) requests.push(action(() => api.categoria(id), '').then(result => { if (Number(query.categoriaId) === id && result) selectedCategory.value = result }))
  await Promise.all(requests)
}
async function loadCategories() {
  const uid = auth?.currentUser?.uid
  const [all, popular] = await Promise.allSettled([api.categorias(), api.populares(5)])
  if (uid !== auth?.currentUser?.uid) return
  if (all.status === 'fulfilled') categories.value = items(all.value, 'categorias')
  if (popular.status === 'fulfilled') popularCategories.value = items(popular.value, 'categorias')
}
async function loadProfile() {
  const uid = auth?.currentUser?.uid, requestId = ++profileRequest
  profileLoading.value = true; profileLoadError.value = ''
  try {
    const result = await api.perfil()
    if (uid !== auth?.currentUser?.uid || requestId !== profileRequest) return
    profile.value = result; needsProfile.value = false
    activeRole.value = result.roles?.includes(activeRole.value) ? activeRole.value : (result.roles?.includes('ASISTENTE') ? 'ASISTENTE' : result.roles?.[0])
    if (!appDataLoaded.value) {
      appDataLoaded.value = true
      await Promise.all([loadCategories(), loadEvents(), loadInterests(), loadNotifications(), loadRecommendations()])
    }
  } catch (error) {
    if (uid !== auth?.currentUser?.uid || requestId !== profileRequest) return
    if (error.status === 404) { profile.value = null; needsProfile.value = true }
    else { profileLoadError.value = error.message || 'No se pudo cargar tu perfil.'; if (profile.value) notify(profileLoadError.value) }
  } finally { if (requestId === profileRequest) profileLoading.value = false }
}
async function loadInterests() { const data = await action(() => api.intereses(), ''); if (data) interests.value = items(data, 'categorias').map(category => Number(category.categoriaId)) }
async function loadTickets() {
  const result = await action(() => api.entradas(), '')
  if (result) tickets.value = items(result, 'entradas')
  const history = await action(() => api.compras(), '')
  if (history) purchases.value = items(history, 'compras')
}
async function loadOrganizer() {
  if (!isOrganizer.value) return
  const [result] = await Promise.all([action(() => api.misEventos(), ''), loadSales()])
  if (result) ownEvents.value = items(result, 'eventos')
}
async function openAccess(event) {
  if (!isOrganizer.value || !isPublished(event)) return
  accessEventId.value = event.eventoId
  await selectSection('accesos')
}
function showTicket(ticket) { if (canShowTicketQr(ticket)) selectedTicket.value = ticket }
function viewPurchaseTickets(purchase) { selectedPurchaseId.value = purchase.compraId; window.scrollTo({ top: 0, behavior: 'smooth' }) }
async function loadReviews() {
  const uid = auth?.currentUser?.uid
  const [pending, history] = await Promise.allSettled([api.pendientesResena(), api.misResenas()])
  if (uid !== auth?.currentUser?.uid) return
  if (pending.status === 'fulfilled') pendingReviews.value = items(pending.value, 'eventos')
  if (history.status === 'fulfilled') reviews.value = items(history.value, 'resenas')
}
async function loadNotifications() {
  const result = await action(() => api.notificaciones(), '')
  if (result) notifications.value = items(result, 'notificaciones')
}
async function loadModeration() {
  if (!isAdmin.value) return
  const result = await action(() => api.modPanel(), '')
  if (result) modPanel.value = result
  await loadModTab()
}
async function loadModTab() {
  if (!isAdmin.value) return
  const requestId = ++moderationRequest, tab = modTab.value
  const requests = {
    eventos: [() => api.modEventos({ estadoModeracion: modStatus.value, texto: modSearch.value }), modEvents, 'eventos'],
    reportes: [() => api.reportes(), reports, 'reportes'],
    usuarios: [() => api.usuarios({ texto: modSearch.value }), users, 'usuarios'],
    auditoria: [() => api.auditoria(), audit, 'registros'],
    reglas: [() => api.reglas(), rules, 'reglas'],
  }
  const [fetch, state, key] = requests[tab]
  const result = await action(fetch, '')
  if (result && requestId === moderationRequest) state.value = items(result, key)
}
async function inspectModerationEvent(event) { modEventDetail.value = await action(() => api.modEvento(event.eventoId), '') }
async function refreshSection() {
  if (active.value === 'explorar') await loadEvents()
  if (active.value === 'entradas') await loadTickets()
  if (['organizar', 'accesos'].includes(active.value)) await loadOrganizer()
  if (active.value === 'cuenta' && profile.value) await loadProfile()
  if (active.value === 'resenas') await loadReviews()
  if (active.value === 'avisos') await loadNotifications()
  if (active.value === 'moderacion') await loadModeration()
}
async function selectSection(id) {
  if (!navSections.value.some(item => item.id === id)) return
  active.value = id
  window.scrollTo({ top: 0, behavior: 'instant' })
  if (profileMenu.value) profileMenu.value.open = false
  assistantOpen.value = false
  if (id !== 'accesos') accessEventId.value = ''
  await refreshSection()
}
async function openEvent(id) {
  const requestId = ++detailRequest
  showReport.value = false; reviewSummary.value = null; eventDetail.value = null
  const result = await action(() => api.evento(id), '')
  if (!result || requestId !== detailRequest) return
  eventDetail.value = result
  detailQuantity.value = 1
  active.value = 'detalle'
  assistantOpen.value = false
  const summary = await action(() => api.resenasEvento(id), '')
  if (summary && eventDetail.value?.eventoId === id && requestId === detailRequest) reviewSummary.value = summary
}
function openCheckout(event, quantity = 1) {
  if (!event.disponibleParaCompra || busy.value) return
  checkout.codigoOperacion = crypto.randomUUID()
  checkout.eventoId = event.eventoId; checkout.cantidad = Math.min(4, Math.max(1, quantity))
  checkout.asistentes = Array.from({ length: checkout.cantidad }, (_, index) => ({ titularNombre: index === 0 ? profile.value?.nombre || '' : '', titularDocumento: '', tipoAcceso: 'GENERAL' }))
  checkoutOpen.value = true
}
function resizeAttendees() {
  const amount = Math.min(4, Math.max(1, Number(checkout.cantidad)))
  checkout.cantidad = amount
  while (checkout.asistentes.length < amount) checkout.asistentes.push({ titularNombre: '', titularDocumento: '', tipoAcceso: 'GENERAL' })
  checkout.asistentes.splice(amount)
}
async function buyTickets() {
  if (busy.value) return
  const result = await action(() => api.comprar({ ...checkout }), 'Compra registrada. Tus entradas están listas.')
  if (result) { checkoutOpen.value = false; eventDetail.value = null; selectedPurchaseId.value = result.compraId; await selectSection('entradas') }
}
async function saveEvent() {
  if (!isOrganizer.value || busy.value) return
  if (!eventForm.fechaInicio || !eventForm.fechaFin || new Date(eventForm.fechaFin) <= new Date(eventForm.fechaInicio)) return notify('Revisa el horario: el fin debe ser posterior al inicio.')
  if (!eventForm.eventoId && new Date(eventForm.fechaInicio) <= new Date()) return notify('El evento debe comenzar en una fecha futura.')
  const data = { ...eventForm, categoriaId: Number(eventForm.categoriaId), aforoTotal: Number(eventForm.aforoTotal), precio: Number(eventForm.precio), fechaInicio: new Date(eventForm.fechaInicio).toISOString(), fechaFin: new Date(eventForm.fechaFin).toISOString() }
  const result = eventForm.eventoId ? await action(() => api.actualizarEvento(eventForm.eventoId, data), 'Evento actualizado.') : await action(() => api.crearEvento(data), 'Borrador creado.')
  if (result !== false) { resetEventForm(); organizerView.value = 'eventos'; await loadOrganizer() }
}
function editEvent(event) { if (!canEditEvent(event)) return; organizerView.value = 'formulario'; Object.assign(eventForm, { ...event, fechaInicio: localInputDate(event.fechaInicio), fechaFin: localInputDate(event.fechaFin) }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
function localInputDate(value) { const d = new Date(value); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
async function goCreateEvent() { await selectSection('organizar'); if (isOrganizer.value) startNewEvent() }
function startNewEvent() { resetEventForm(); organizerView.value = 'formulario' }
function resetEventForm() { Object.assign(eventForm, { eventoId: 0, categoriaId: '', nombre: '', descripcion: '', imagenUrl: '', fechaInicio: '', fechaFin: '', sede: '', direccion: '', departamento: 'Lima', provincia: 'Lima', distrito: '', aforoTotal: 50, precio: 0 }) }
async function submitReview(eventId) {
  const draft = reviewDraft(eventId)
  const result = await action(() => api.crearResena({ eventoId, calificacion: Number(draft.calificacion), comentario: draft.comentario }), 'Gracias por compartir tu reseña.')
  if (result !== false) await loadReviews()
}
function reviewDraft(eventId) { return reviewDrafts[eventId] ||= { calificacion: 5, comentario: '' } }
async function registerProfile() {
  if (firebaseConfigured && auth?.currentUser) {
    const created = await action(() => api.registrar({ nombre: authForm.nombre.trim(), email: auth.currentUser.email }), 'Perfil creado.')
    if (created === false) return
    await loadProfile()
  } else notify('Inicia sesión con Firebase antes de registrar el perfil.')
}
async function activateOrganizer() {
  const result = await action(() => api.activarOrganizador(), 'Rol de organizador activado.')
  if (result) { profile.value = result; activeRole.value = 'ORGANIZADOR'; organizerView.value = 'eventos'; await loadOrganizer() }
}
async function setRole(role) { const result = await action(() => api.cambiarRol(role), 'Rol actualizado.'); if (result) { activeRole.value = result.rolActivo || role; await selectSection(role === 'ORGANIZADOR' ? 'organizar' : role === 'ADMINISTRADOR' ? 'moderacion' : 'explorar') } }
async function createAccount() {
  if (!auth) return notify('Configura Firebase en .env.local para crear cuentas reales.')
  const name = authForm.nombre.trim()
  const credential = await action(() => createUserWithEmailAndPassword(auth, authForm.email, authForm.password), '', false)
  if (credential?.user) {
    authForm.nombre = name
    const updated = await action(() => updateProfile(credential.user, { displayName: name }), '', false)
    if (updated !== false) await registerProfile()
  }
}
async function login() { if (!auth) return notify('Configura Firebase en .env.local para iniciar sesión.'); await action(() => signInWithEmailAndPassword(auth, authForm.email, authForm.password), '', false) }
async function saveInterests() { await action(() => api.actualizarIntereses(interests.value), 'Preferencias guardadas.') }
async function publishEvent(event) { if (!canPublishEvent(event) || busy.value) return; await action(() => api.publicarEvento(event.eventoId), 'Evento publicado.'); await loadOrganizer() }
async function cancelEvent(event) { if (!canEditEvent(event) || busy.value) return; if (!confirm(`¿Cancelar “${event.nombre}”?`)) return; await action(() => api.cancelarEvento(event.eventoId), 'Evento cancelado.'); await loadOrganizer() }
async function loadSales() { const r = await action(() => api.ventas(salesFilter), ''); if (r) sales.value = r }
async function exportSales(format) { await action(() => api.exportarVentas(format, salesFilter), `Reporte ${format.toUpperCase()} descargado.`) }
async function reportEvent(id) { const motivo = reportReason.value.trim(); if (motivo.length < 5) return notify('Escribe un motivo de al menos 5 caracteres.'); const r = await action(() => api.reportarEvento(id, motivo), 'Reporte enviado.'); if (r !== false) { reportReason.value = ''; showReport.value = false; eventDetail.value = null } }
async function markRead(notification) { const result = await action(() => api.leerNotificacion(notification.notificacionId), 'Notificación marcada como leída.'); if (result !== false) notification.leida = true }
async function markAllRead() { const result = await action(() => api.leerTodas(), 'Notificaciones marcadas como leídas.'); if (result !== false) notifications.value.forEach(n => n.leida = true) }
async function moderate(event) {
  if (busy.value) return
  const motivo = prompt('Motivo o comentario (opcional):')
  if (motivo === null) return
  const r = await action(() => api.moderarEvento(event.eventoId, { estadoModeracion: event.estadoModeracion === 'CONFORME' ? 'DESACTIVADO' : 'CONFORME', motivo, confirmado: true }), 'Moderación actualizada.')
  if (r !== false) await loadModTab()
}
async function resolveReport(report) {
  const resolucion = prompt('Escribe la resolución del reporte:')
  if (!resolucion) return
  await action(() => api.resolverReporte(report.reporteId, { estado: 'RESUELTO', resolucion, confirmado: true }), 'Reporte resuelto.')
  await loadModTab()
}
async function changeUser(user) {
  const estado = prompt('Nuevo estado: ACTIVO, BLOQUEADO o INACTIVO', user.estado === 'ACTIVO' ? 'BLOQUEADO' : 'ACTIVO')
  if (!estado) return
  await action(() => api.cambiarEstadoUsuario(user.usuarioId, { estado: estado.toUpperCase(), motivo: 'Cambio desde el panel de moderación', confirmado: true }), 'Estado de cuenta actualizado.')
  await loadModTab()
}
async function createRule() {
  const nombre = prompt('Nombre de la regla'); if (!nombre) return
  const criterio = prompt('Criterio (texto para IA o resumen de la regla)'); if (!criterio) return
  await action(() => api.crearRegla({ nombre, tipo: 'IA', criterio, accion: 'EN_REVISION' }), 'Regla creada.')
  await loadModTab()
}
async function toggleRule(rule) { const result = await action(() => api.toggleRegla(rule.reglaId, !rule.activa), `Regla ${rule.activa ? 'desactivada' : 'activada'}.`); if (result !== false) rule.activa = !rule.activa }
async function verifyUser(user) { await action(() => api.verificarUsuario(user.usuarioId), 'Cuenta verificada.'); await loadModTab() }

function resetSession() {
  ++profileRequest; ++eventsRequest
  profile.value = null; appDataLoaded.value = false; needsProfile.value = false; profileLoadError.value = ''; active.value = 'explorar'; activeRole.value = 'ASISTENTE'
  for (const state of [events, categories, popularCategories, tickets, purchases, interests, recommendations, ownEvents, notifications, pendingReviews, reviews, modEvents, reports, users, audit, rules]) state.value = []
    eventDetail.value = null; selectedTicket.value = null; selectedPurchaseId.value = null; modEventDetail.value = null; modPanel.value = null; sales.value = null; checkoutOpen.value = false; showReport.value = false
  assistantOpen.value = false; recommendationCaption.value = ''; accessEventId.value = ''; organizerView.value = 'eventos'; eventTotal.value = 0; message.value = ''; authForm.password = ''; authForm.nombre = ''; authForm.email = ''; resetEventForm()
  Object.assign(query, { texto: '', categoriaId: '', ubicacion: '', fechaDesde: '', fechaHasta: '', soloDisponibles: true, pagina: 1 }); selectedCategory.value = null
  ++detailRequest; ++moderationRequest; ++recommendationRequest
  for (const key of Object.keys(reviewDrafts)) delete reviewDrafts[key]
}
onMounted(() => {
  if (!auth) { profileLoading.value = false; return }
  onAuthStateChanged(auth, async (user) => {
    if (firebaseUser.value?.uid !== user?.uid) resetSession()
    firebaseUser.value = user
    if (user) { authForm.email = user.email || ''; if (user.displayName) authForm.nombre = user.displayName; await loadProfile() }
    else { profile.value = null; profileLoading.value = false }
  })
})
watch(modTab, loadModTab)
</script>

<template>
  <div v-if="!profile" class="auth-gate">
    <header class="auth-header"><a class="brand" href="#"><span class="brand-mark brand-letter">e</span><span class="brand-wordmark">eventia<span>.</span><small>EVENTOS & EXPERIENCIAS</small></span></a><span>EVENTOS PARA VIVIRLOS</span></header>
    <main class="auth-layout">
      <section class="auth-story"><div class="eyebrow"><span class="sparkle">✳</span> TU PRÓXIMA HISTORIA EMPIEZA AQUÍ</div><h1>Tu próximo plan<br><em>empieza aquí.</em></h1><p>Encuentra conciertos, cultura y experiencias para vivir la ciudad de otra manera.</p><div class="auth-photo"><div><span>✳</span><b>Nos vemos<br>ahí afuera.</b></div></div><div class="auth-trust"><span>✳</span> Música · Cultura · Experiencias</div></section>
      <section class="auth-card">
        <template v-if="profileLoading"><h2>Cargando tu cuenta…</h2><p class="auth-card-copy" role="status">Estamos recuperando tu perfil y tus permisos.</p></template>
        <template v-else-if="profileLoadError"><h2>No pudimos abrir tu cuenta.</h2><p class="form-error" role="alert">{{ profileLoadError }}</p><button class="primary-button" @click="loadProfile">Reintentar</button><button class="text-button" @click="signOut(auth)">Usar otra cuenta</button></template>
        <template v-else-if="!hasFirebaseAccount">
          <div class="auth-tabs"><button :class="{ active: authMode==='login' }" @click="authMode='login'">Iniciar sesión</button><button :class="{ active: authMode==='register' }" @click="authMode='register'">Crear cuenta</button></div>
          <div class="section-kicker">{{ authMode==='login' ? 'QUÉ BUENO TENERTE DE VUELTA' : 'EMPIEZA POR AQUÍ' }}</div><h2>{{ authMode==='login' ? 'Bienvenido de nuevo.' : 'Crea tu cuenta.' }}</h2><p class="auth-card-copy">{{ authMode==='login' ? 'Ingresa para continuar descubriendo.' : 'Un perfil para todos tus planes.' }}</p>
          <form class="auth-form" @submit.prevent="firebaseConfigured ? (authMode==='login' ? login() : createAccount()) : notify('Falta configurar el servicio de autenticación.')">
            <label v-if="authMode==='register'">Nombre completo<input v-model="authForm.nombre" autocomplete="name" required minlength="2" maxlength="80" placeholder="¿Cómo te llamas?"></label>
            <label>Usuario (correo electrónico)<input v-model="authForm.email" type="email" autocomplete="username" required placeholder="tu@correo.com"></label>
            <label>Contraseña<div class="password-field"><input v-model="authForm.password" :type="showPassword ? 'text' : 'password'" :autocomplete="authMode==='login'?'current-password':'new-password'" required minlength="6" placeholder="Al menos 6 caracteres"><button type="button" :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="showPassword=!showPassword"><svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></label>
            <button class="primary-button auth-submit" :disabled="busy || !firebaseConfigured">{{ authMode==='login' ? 'Iniciar sesión' : 'Crear cuenta' }} <span>↗</span></button>
          </form>
          <div class="auth-switch">{{ authMode==='login' ? '¿Todavía no tienes cuenta?' : '¿Ya tienes una cuenta?' }} <button @click="authMode=authMode==='login'?'register':'login'">{{ authMode==='login' ? 'Regístrate' : 'Inicia sesión' }}</button></div>
          <div v-if="!firebaseConfigured" class="dev-access"><small>El acceso con usuario y contraseña requiere configurar Firebase. El backend actual usa Firebase para autenticar y su API registra el perfil después del inicio de sesión.</small><small class="auth-note">Completa las variables de Firebase en Frontend/.env.local para habilitar Login y Registro.</small></div>
        </template>
        <template v-else-if="needsProfile">
          <div class="section-kicker">UN ÚLTIMO PASO</div><h2>Completa tu perfil.</h2><p class="auth-card-copy">Tu acceso ya está listo. Añade estos datos para entrar a tu cuenta.</p>
          <form class="auth-form" @submit.prevent="registerProfile"><label>Nombre completo<input v-model="authForm.nombre" autocomplete="name" required minlength="2" maxlength="80" placeholder="¿Cómo te llamas?"></label><label>Correo electrónico<input v-model="authForm.email" type="email" autocomplete="email" readonly required placeholder="tu@correo.com"></label><button class="primary-button auth-submit" :disabled="busy">Entrar a mi cuenta <span>↗</span></button></form>
          <button class="text-button auth-signout" @click="signOut(auth)">Usar otra cuenta</button>
        </template>
        <div class="auth-secure"><span>◈</span> {{ firebaseConfigured ? 'Acceso seguro · Tu contraseña la gestiona Firebase' : 'Autenticación disponible al configurar Firebase' }}</div>
      </section>
    </main>
    <footer class="auth-footer"><span>© 2026 EVENTIA</span><span>Hecho para vivirlo.</span></footer>
    <div v-if="message" class="toast" role="status">{{ message }}</div>
  </div>

  <div v-else class="app-frame">
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="#" @click.prevent="selectSection('explorar')"><span class="brand-mark brand-letter">e</span><span class="brand-wordmark">eventia<span>.</span><small>EVENTOS & EXPERIENCIAS</small></span></a>
        <nav class="top-nav" aria-label="Navegación principal"><button :class="{ active: active === 'explorar' }" @click="selectSection('explorar')">Explorar eventos</button><button :class="{ active: active === 'entradas' }" @click="selectSection('entradas')">Mis entradas <span v-if="tickets.length" class="nav-count">{{ tickets.length }}</span></button><button v-if="isOrganizer" :class="{ active: ['organizar','accesos'].includes(active) }" @click="selectSection('organizar')">Mis eventos</button></nav>
        <div class="header-actions">
          <button class="primary-button create-event-button" @click="goCreateEvent"><AppIcon name="plus" />Crear evento</button>
          <label class="role-switch"><span>Modo:</span><select :value="activeRole" aria-label="Cambiar rol activo" :disabled="busy" @change="setRole($event.target.value)"><option v-for="role in profile.roles" :key="role" :value="role">{{ role === 'ASISTENTE' ? 'Asistente' : role === 'ORGANIZADOR' ? 'Organizador' : 'Administrador' }}</option></select></label>
          <button class="icon-button notification-button" aria-label="Ver notificaciones" @click="selectSection('avisos')"><AppIcon name="bell" /><i v-if="notifications.some(n => !n.leida)"></i></button>
          <details ref="profileMenu" class="profile-menu"><summary><span class="avatar"><img v-if="firebaseUser?.photoURL" :src="firebaseUser.photoURL" alt=""> <template v-else>{{ profile.nombre?.[0] || 'U' }}</template></span><span class="profile-name"><strong>{{ profile.nombre }}</strong><small>Mi perfil</small></span><AppIcon name="chevron" /></summary><div class="profile-dropdown"><button v-for="item in navSections.filter(item => !['explorar','entradas'].includes(item.id))" :key="item.id" @click="selectSection(item.id)">{{ item.label }}</button><button @click="refreshSection();profileMenu.open=false">Actualizar vista</button><button class="logout-button" @click="signOut(auth)">Cerrar sesión</button></div></details>
        </div>
      </div>
      <nav class="mobile-nav" aria-label="Secciones"><button v-for="item in navSections" :key="item.id" :class="{ active: active === item.id }" @click="selectSection(item.id)">{{ item.label }}</button></nav>
    </header>
    <div class="content-area">
      <main class="page-content">
        <section v-if="active === 'explorar'" class="page-view discovery-page">
          <div class="discovery-hero">
            <span class="hero-badge"><AppIcon name="sparkles" />Tu próxima experiencia empieza aquí</span>
            <h1>Encuentra eventos de tecnología, cultura y negocios <span>en el Perú.</span></h1>
            <p>Explora la cartelera, encuentra un plan para ti y lleva tus entradas siempre en el celular.</p>
            <form class="discovery-search" @submit.prevent="loadEvents(true)">
              <label class="search-field"><AppIcon name="search" /><input v-model="query.texto" aria-label="Buscar eventos" placeholder="Buscar conferencias, conciertos, talleres…"></label>
              <label class="location-field"><AppIcon name="pin" /><input v-model="query.ubicacion" aria-label="Ciudad o departamento" list="event-cities" placeholder="Todo el Perú"><datalist id="event-cities"><option v-for="city in ['Lima','Arequipa','Cusco','Trujillo','Piura','Iquitos','Huancayo']" :key="city" :value="city" /></datalist></label>
              <label class="category-field"><AppIcon name="grid" /><select v-model="query.categoriaId" aria-label="Categoría"><option value="">Todas las categorías</option><option v-for="cat in categories" :key="cat.categoriaId" :value="cat.categoriaId">{{ cat.nombre }}</option></select></label>
              <button class="primary-button" :disabled="busy"><AppIcon name="search" />Buscar</button>
            </form>
            <details class="advanced-filters"><summary><AppIcon name="calendar" />Fechas y disponibilidad<AppIcon name="chevron" /></summary><div class="dates"><label>Desde <input v-model="query.fechaDesde" type="date" @change="loadEvents(true)"></label><label>Hasta <input v-model="query.fechaHasta" type="date" @change="loadEvents(true)"></label><label class="available"><input v-model="query.soloDisponibles" type="checkbox" @change="loadEvents(true)">Solo eventos con cupos</label></div></details>
          </div>
          <div class="discovery-layout">
            <div class="event-feed">
              <section v-if="recommendations.length" class="recommendations-section"><div class="feed-heading"><h2><AppIcon name="sparkles" />Recomendados para ti</h2><p>{{ recommendationCaption }}</p></div><div class="recommendation-grid"><EventCard v-for="event in recommendations" :key="event.eventoId" :event="event" compact @select="openEvent" /></div></section>
              <section class="catalog-section">
                <div class="feed-heading"><h2>Explorar todos los eventos</h2><span>{{ eventTotal }} {{ eventTotal === 1 ? 'evento disponible' : 'eventos disponibles' }}</span></div>
                <div class="filter-chips"><button :class="{ selected: !query.categoriaId }" @click="filterByCategory(null)">Todos</button><button v-for="cat in popularCategories" :key="cat.categoriaId" :class="{ selected: Number(query.categoriaId) === cat.categoriaId }" @click="filterByCategory(cat.categoriaId)">{{ cat.nombre }}</button></div>
                <div v-if="events.length" class="event-grid"><EventCard v-for="event in events" :key="event.eventoId" :event="event" @select="openEvent" /></div>
                <div v-else-if="busy" class="event-grid" aria-label="Cargando eventos" role="status"><div v-for="number in 3" :key="number" class="event-skeleton"><div></div><span></span><span></span></div></div>
                <div v-else class="empty-state"><AppIcon name="search" /><h3>No encontramos eventos con esos filtros</h3><p>Prueba con otra palabra, ciudad o fecha.</p><button class="secondary-button" @click="query.texto='';query.ubicacion='';query.categoriaId='';query.fechaDesde='';query.fechaHasta='';loadEvents(true)">Limpiar filtros</button></div>
                <div class="pagination"><span>Página {{ query.pagina }} de {{ totalPages }}</span><div><button :disabled="query.pagina <= 1 || busy" @click="changePage(-1)">Anterior</button><button v-for="page in Array.from({ length: Math.min(totalPages, 5) }, (_, i) => Math.min(Math.max(1, query.pagina - 2), Math.max(1, totalPages - 4)) + i)" :key="page" :class="{ current: page === query.pagina }" :disabled="busy" @click="changePage(page-query.pagina)">{{ page }}</button><button :disabled="query.pagina >= totalPages || busy" @click="changePage(1)">Siguiente</button></div></div>
              </section>
            </div>
          </div>
        </section>

        <section v-else-if="active === 'detalle' && eventDetail" class="page-view event-detail-page">
          <button class="detail-back" @click="selectSection('explorar')">← Volver a explorar</button>
          <div class="detail-layout">
            <div class="detail-main">
              <div class="detail-hero-image" :style="eventDetail.imagenUrl ? { backgroundImage: `url('${eventDetail.imagenUrl}')` } : {}"><span>{{ eventDetail.categoriaNombre || 'Evento' }}</span></div>
              <section class="detail-title-card"><span class="section-kicker">{{ eventDetail.categoriaNombre || 'EVENTO' }} · {{ eventDetail.distrito || eventDetail.provincia }}</span><h1>{{ eventDetail.nombre }}</h1><div class="detail-facts"><div><AppIcon name="calendar"/><span><small>FECHA Y HORA</small><b>{{ new Date(eventDetail.fechaInicio).toLocaleString('es-PE', { dateStyle:'full', timeStyle:'short' }) }}</b><small>Hasta {{ new Date(eventDetail.fechaFin).toLocaleString('es-PE', { dateStyle:'short', timeStyle:'short' }) }}</small></span></div><div><AppIcon name="pin"/><span><small>LUGAR</small><b>{{ eventDetail.sede }}</b><small>{{ [eventDetail.direccion,eventDetail.distrito,eventDetail.provincia].filter(Boolean).join(' · ') }}</small></span></div><div><AppIcon name="grid"/><span><small>DISPONIBILIDAD</small><b>{{ eventDetail.cuposDisponibles }} cupos</b><small>de {{ eventDetail.aforoTotal }} en total</small></span></div></div></section>
              <section class="panel-card detail-description"><h2>Descripción del evento</h2><p>{{ eventDetail.descripcion || 'El organizador aún no agregó una descripción.' }}</p><a v-if="eventDetail.direccion || eventDetail.sede" :href="`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([eventDetail.sede,eventDetail.direccion,eventDetail.distrito].filter(Boolean).join(', '))}`" target="_blank" rel="noopener noreferrer">Ver ubicación en el mapa ↗</a></section>
              <section class="panel-card review-summary detail-reviews"><h2>Reseñas de asistentes <span v-if="reviewSummary?.total">· {{ Number(reviewSummary.promedio).toFixed(1) }} ★ ({{ reviewSummary.total }})</span></h2><article v-for="review in reviewSummary?.resenas || []" :key="review.resenaId"><b>{{ review.usuarioNombre }} · {{ '★'.repeat(review.calificacion) }}{{ '☆'.repeat(5-review.calificacion) }}</b><p>{{ review.comentario || 'Sin comentario' }}</p></article><small v-if="!reviewSummary?.resenas?.length">{{ reviewSummary ? 'Todavía no hay reseñas.' : 'Cargando reseñas…' }}</small></section>
              <button class="text-button report-link" @click="showReport=!showReport">Reportar evento</button><form v-if="showReport" class="report-form visible" @submit.prevent="reportEvent(eventDetail.eventoId)"><input v-model="reportReason" minlength="5" maxlength="500" placeholder="Motivo del reporte" required><button class="secondary-button">Enviar reporte</button></form>
            </div>
            <aside class="ticket-purchase-card"><div class="capacity-band"><b>Aforo del evento</b><span>{{ eventDetail.cuposDisponibles }} disponibles</span><small>{{ eventDetail.entradasVendidas }} de {{ eventDetail.aforoTotal }} entradas vendidas</small><i><span :style="{width: `${Math.min(100, eventDetail.aforoTotal ? 100*eventDetail.entradasVendidas/eventDetail.aforoTotal : 0)}%`}"></span></i></div><div class="purchase-content"><div class="purchase-heading"><b>Entrada general</b><strong>{{ Number(eventDetail.precio) === 0 ? 'Gratis' : `S/ ${Number(eventDetail.precio).toFixed(2)}` }}</strong></div><p>Acceso al evento para una persona.</p><label>Cantidad<select v-model.number="detailQuantity"><option v-for="n in Math.min(4, Math.max(1,eventDetail.cuposDisponibles))" :key="n" :value="n">{{ n }}</option></select></label><div class="purchase-total"><span>Total a pagar</span><b>{{ Number(eventDetail.precio) === 0 ? 'Gratis' : `S/ ${(Number(eventDetail.precio)*detailQuantity).toFixed(2)}` }}</b></div><button class="primary-button" :disabled="!eventDetail.disponibleParaCompra || !eventDetail.cuposDisponibles" @click="openCheckout(eventDetail,detailQuantity)">{{ eventDetail.disponibleParaCompra ? 'Continuar con la compra' : 'Entradas no disponibles' }} ↗</button><small>El QR se genera para cada entrada registrada.</small></div></aside>
          </div>
        </section>

        <section v-else-if="active === 'entradas'" class="page-view">
          <div class="page-title"><div><div class="section-kicker">LISTO PARA ASISTIR</div><h1>Mis <em>entradas.</em></h1><p>Muestra tu QR al equipo de ingreso cuando llegues al evento.</p></div></div>
          <div class="panel-card">
            <div class="panel-head"><h2>{{ selectedPurchaseId ? 'Entradas de la compra #' + selectedPurchaseId : 'Tus entradas' }}</h2><button v-if="selectedPurchaseId" class="text-button" @click="selectedPurchaseId=null">Ver todas</button><span v-else>{{ ticketList.length }} entradas</span></div>
            <div v-if="ticketList.length" class="ticket-list">
              <article v-for="ticket in ticketList" :key="ticket.entradaId" class="ticket-row">
                <div class="ticket-main"><b>{{ ticket.eventoTitulo || 'Entrada #' + ticket.entradaId }}</b><small>{{ ticket.titularNombre }} · {{ ticket.tipoAcceso }}</small><small v-if="ticket.fechaInicio">{{ new Date(ticket.fechaInicio).toLocaleString('es-PE') }}</small><span class="ticket-state">{{ ticket.estado === 'UTILIZADA' ? 'Ingreso registrado' : canShowTicketQr(ticket) ? 'Pendiente de ingreso' : 'Entrada anulada o no disponible' }}</span></div>
                <button v-if="canShowTicketQr(ticket)" class="ticket-qr-button" @click="showTicket(ticket)" :aria-label="'Mostrar QR de ' + ticket.titularNombre"><QrCode :value="ticket.codigoQr" /><span>Mostrar QR</span></button>
              </article>
            </div>
            <div v-else class="empty-inline">{{ selectedPurchaseId ? 'No se encontraron entradas para esta compra. Actualiza la lista o consulta todas tus entradas.' : 'Todavía no tienes entradas. Encuentra un evento y reserva tu lugar.' }}</div>
          </div>
          <div class="panel-card"><div class="panel-head"><h2>Historial de compras</h2><span>{{ purchases.length }} compras</span></div><div v-if="purchases.length" class="data-table"><div v-for="buy in purchases" :key="buy.compraId" class="table-row"><div><b>{{ buy.eventoTitulo }}</b><small>Compra #{{ buy.compraId }} · {{ buy.estado }} · {{ buy.cantidad }} entradas</small></div><span>S/ {{ Number(buy.total).toFixed(2) }}</span><button class="text-button" @click="viewPurchaseTickets(buy)">Ver entradas</button></div></div><div v-else class="empty-inline">Tus compras aparecerán aquí.</div></div>
        </section>

        <section v-else-if="active === 'organizar'" class="page-view">
          <div class="page-title"><div><div class="section-kicker">ORGANIZACIÓN</div><h1>Mis <em>eventos.</em></h1><p>Prepara el evento, publica sus entradas y consulta las ventas.</p></div><button v-if="isOrganizer && organizerView !== 'formulario'" class="primary-button" @click="startNewEvent">＋ Crear evento</button></div>
          <div v-if="!isOrganizer" class="callout"><div><b>Empieza a organizar</b><p>Activa el rol de organizador para crear tus eventos.</p></div><button class="primary-button" :disabled="busy" @click="activateOrganizer">Activar organizador</button></div>
          <template v-else>
            <nav class="workspace-tabs" aria-label="Gestión de eventos"><button :class="{ active: organizerView === 'eventos' }" @click="organizerView='eventos'">Mis eventos</button><button :class="{ active: organizerView === 'ventas' }" @click="organizerView='ventas';loadSales()">Ventas</button></nav>
<form v-if="organizerView === 'formulario'" class="panel-card form-panel" @submit.prevent="saveEvent"><div class="panel-head"><h2>{{ eventForm.eventoId ? 'Editar evento' : 'Crear evento' }}</h2><button type="button" class="text-button" @click="organizerView='eventos';resetEventForm()">Volver a mis eventos</button></div><div class="form-grid"><label class="wide">Nombre del evento<input v-model="eventForm.nombre" required maxlength="150"></label><label>Categoría<select v-model="eventForm.categoriaId" required><option value="" disabled>Selecciona</option><option v-for="cat in categories" :key="cat.categoriaId" :value="cat.categoriaId">{{ cat.nombre }}</option></select></label><label>Precio (S/)<input v-model.number="eventForm.precio" type="number" min="0" step="0.01"></label><label>Inicio<input v-model="eventForm.fechaInicio" type="datetime-local" required></label><label>Fin<input v-model="eventForm.fechaFin" type="datetime-local" required></label><label>Sede<input v-model="eventForm.sede" required maxlength="150"></label><label>Dirección<input v-model="eventForm.direccion" required></label><label>Departamento<input v-model="eventForm.departamento" required maxlength="60"></label><label>Provincia<input v-model="eventForm.provincia" required maxlength="60"></label><label>Distrito<input v-model="eventForm.distrito" required></label><label>Aforo<input v-model.number="eventForm.aforoTotal" type="number" min="1" required></label><label class="wide">URL de imagen<input v-model="eventForm.imagenUrl" type="url"></label><label class="wide">Descripción<textarea v-model="eventForm.descripcion" rows="3" required></textarea></label></div><button class="primary-button" :disabled="busy || !isOrganizer">{{ eventForm.eventoId ? 'Guardar cambios' : 'Crear borrador' }} ↗</button></form>
            <div v-if="organizerView === 'eventos'" class="organizer-dashboard"><section class="organizer-welcome panel-card"><div><div class="section-kicker">PANEL DEL ORGANIZADOR</div><h2>Gestiona tus eventos.</h2><p>Publica tus próximos planes y consulta las ventas registradas.</p></div><div class="organizer-head-actions"><button class="secondary-button" @click="organizerView='ventas';loadSales()">Ver ventas</button><button class="primary-button" @click="selectSection('accesos')">Control de acceso</button></div></section>
              <div v-if="sales" class="stats-grid organizer-stats"><div><small>Ingresos registrados</small><strong>S/ {{ Number(sales.ingresosTotales).toFixed(2) }}</strong></div><div><small>Entradas vendidas</small><strong>{{ sales.entradasVendidas }}</strong></div><div><small>Ocupación total</small><strong>{{ Number(sales.tasaOcupacion).toFixed(1) }}%</strong></div><div><small>Eventos con aforo</small><strong>{{ sales.eventosConControlAforo }}</strong></div></div>
              <div class="organizer-columns"><div class="panel-card"><div class="panel-head"><h2>Mis eventos publicados</h2><span>{{ ownEvents.length }} en total</span></div>
              <div v-if="ownEvents.length" class="data-table"><div v-for="event in ownEvents" :key="event.eventoId" class="table-row organizer-row"><div><b>{{ event.nombre }}</b><small>{{ new Date(event.fechaInicio).toLocaleString('es-PE') }} · {{ event.estado }} · {{ event.estadoModeracion }}</small></div><span>{{ event.entradasVendidas }}/{{ event.aforoTotal }} entradas</span><div class="row-actions"><button v-if="canEditEvent(event)" :disabled="busy" @click="editEvent(event)">Editar</button><button v-if="canPublishEvent(event)" :disabled="busy" @click="publishEvent(event)">Publicar</button><button v-if="isPublished(event) && !event.finalizado" :disabled="busy" @click="openAccess(event)">Recibir asistentes</button><button v-if="canEditEvent(event)" :disabled="busy" @click="cancelEvent(event)">Cancelar evento</button></div></div></div>
              <div v-else class="empty-inline">Empieza creando un borrador. Después podrás revisarlo y publicarlo.</div>
              </div><div class="organizer-access-column"><div class="section-kicker">DÍA DEL EVENTO</div><h2>Control de acceso</h2><p>Selecciona un evento en curso para validar entradas desde una foto del QR.</p><AccessControl :events="ownEvents" :event-id="accessEventId" /><button class="text-button" @click="selectSection('accesos')">Abrir control de acceso completo ↗</button></div></div>
            </div>
            <div v-if="organizerView === 'ventas'" class="panel-card"><div class="panel-head"><h2>Resumen de ventas</h2><select v-model="salesFilter.periodo" @change="loadSales"><option value="TODO">Todo</option><option value="MES">Este mes</option><option value="SEMANA">Últimos 7 días</option></select></div><div v-if="sales" class="stats-grid"><div><small>Ingresos registrados</small><strong>S/ {{ Number(sales.ingresosTotales).toFixed(2) }}</strong></div><div><small>Entradas vendidas</small><strong>{{ sales.entradasVendidas }}</strong></div><div><small>Ocupación</small><strong>{{ Number(sales.tasaOcupacion).toFixed(1) }}%</strong></div><div><small>Eventos vigentes</small><strong>{{ sales.eventosConControlAforo }}</strong></div></div><div v-else class="empty-inline">No hay datos de ventas disponibles.</div><div class="export-actions"><button :disabled="busy || !sales" @click="exportSales('excel')">Descargar Excel ↓</button><button :disabled="busy || !sales" @click="exportSales('pdf')">Descargar PDF ↓</button></div></div>
          </template>
        </section>

        <section v-else-if="active === 'accesos'" class="page-view"><div class="page-title"><div><div class="section-kicker">DÍA DEL EVENTO</div><h1>Control de <em>acceso.</em></h1><p>Verifica entradas y confirma la llegada de cada asistente.</p></div></div><AccessControl v-if="isOrganizer" :events="ownEvents" :event-id="accessEventId" /></section>

        <section v-else-if="active === 'cuenta'" class="page-view">
          <div class="page-title"><div><div class="section-kicker">TU PERFIL</div><h1>Tu cuenta, <em>a tu manera.</em></h1><p>Gestiona tus datos, roles y preferencias.</p></div></div>
          <div class="two-column">
            <div class="panel-card"><div class="panel-head"><h2>Tu perfil</h2><span class="status-pill">{{ profile.estado }}</span></div>
              <div class="profile-summary"><span class="large-avatar">{{ profile.nombre?.[0] || 'U' }}</span><div><h3>{{ profile.nombre }}</h3><p>{{ profile.email }}</p><small>{{ profile.verificado ? 'Cuenta verificada' : 'Perfil activo' }} · {{ (profile.roles || []).join(' / ') }}</small></div></div>
              <div class="account-actions"><label>Rol activo<select :value="activeRole" @change="setRole($event.target.value)"><option v-for="role in profile.roles" :key="role">{{ role }}</option></select></label><button v-if="!isOrganizer" class="secondary-button" @click="activateOrganizer">Activar rol de organizador</button><button class="text-button" @click="signOut(auth)">Cerrar sesión</button></div>
            </div>
            <div class="panel-card"><div class="panel-head"><h2>Tus intereses</h2><span>Máximo 10 categorías</span></div><p class="muted">Personaliza las recomendaciones de eventos.</p><div class="interest-list"><label v-for="cat in categories" :key="cat.categoriaId" class="interest-chip"><input v-model="interests" type="checkbox" :value="cat.categoriaId" :disabled="interests.length >= 10 && !interests.includes(cat.categoriaId)"><span>{{ cat.nombre }}</span></label></div><button class="secondary-button" @click="saveInterests">Guardar preferencias ↗</button></div>
          </div>
        </section>

        <section v-else-if="active === 'resenas'" class="page-view"><div class="page-title"><div><div class="section-kicker">DESPUÉS DEL EVENTO</div><h1>Lo viviste. <em>Cuéntalo.</em></h1><p>Deja una reseña y ayuda a otros a encontrar buenos planes.</p></div></div><div class="panel-card"><div class="panel-head"><h2>Reseñas pendientes</h2><span>{{ pendingReviews.length }} eventos</span></div><div v-if="pendingReviews.length" class="data-table"><div v-for="event in pendingReviews" :key="event.eventoId" class="table-row review-row"><div><b>{{ event.nombre }}</b><small>{{ event.sede }} · {{ new Date(event.fechaFin).toLocaleDateString('es-PE') }}</small></div><div class="review-form"><select v-model="reviewDraft(event.eventoId).calificacion"><option v-for="score in [5,4,3,2,1]" :key="score" :value="score">{{ score }} estrellas</option></select><input v-model="reviewDraft(event.eventoId).comentario" placeholder="¿Cómo estuvo? (opcional)"><button class="primary-button" @click="submitReview(event.eventoId)">Enviar ↗</button></div></div></div><div v-else class="empty-inline">No tienes reseñas pendientes.</div></div><div class="panel-card"><div class="panel-head"><h2>Lo que has escrito</h2><span>{{ reviews.length }} reseñas</span></div><div v-if="reviews.length" class="review-history"><article v-for="review in reviews" :key="review.resenaId"><div><b>{{ review.eventoNombre }}</b><span class="stars">{{ '★'.repeat(review.calificacion) }}{{ '☆'.repeat(5-review.calificacion) }}</span></div><p>{{ review.comentario || 'Sin comentario' }}</p><small>{{ new Date(review.fechaCreacion).toLocaleDateString('es-PE') }}</small></article></div><div v-else class="empty-inline">Tus reseñas publicadas aparecerán aquí.</div></div></section>

        <section v-else-if="active === 'avisos'" class="page-view"><div class="page-title"><div><div class="section-kicker">AL DÍA CONTIGO</div><h1>Tus <em>notificaciones.</em></h1><p>Actualizaciones de los eventos a los que vas.</p></div><button class="secondary-button" :disabled="!notifications.some(n=>!n.leida)" @click="markAllRead">Marcar todas como leídas</button></div><div class="panel-card notification-list"><article v-for="notice in notifications" :key="notice.notificacionId" :class="{ unread: !notice.leida }"><span class="notice-icon" :style="{ color: notice.color }">{{ notice.icono === 'warning' ? '!' : '✳' }}</span><div><div class="notice-title"><b>{{ notice.titulo }}</b><span v-if="!notice.leida" class="new-badge">NUEVA</span></div><p>{{ notice.mensaje }}</p><small>{{ notice.eventoNombre }} · {{ new Date(notice.fechaCreacion).toLocaleString('es-PE') }}</small></div><button v-if="!notice.leida" class="text-button" @click="markRead(notice)">Marcar leída</button></article><div v-if="!notifications.length" class="empty-inline">No tienes notificaciones por ahora.</div></div></section>

        <section v-else-if="active === 'moderacion'" class="page-view"><div v-if="!isAdmin" class="empty-state access-denied"><span>⌘</span><h3>Panel de administración</h3><p>Inicia sesión con una cuenta que tenga el rol ADMINISTRADOR.</p></div><template v-else><div class="page-title"><div><div class="section-kicker">CENTRO DE CONFIANZA</div><h1>Panel de <em>moderación.</em></h1><p>Eventos, reportes, cuentas y auditoría.</p></div></div><div v-if="modPanel" class="stats-grid mod-stats"><div><small>Usuarios activos</small><strong>{{ modPanel.usuariosActivos }}</strong></div><div><small>Eventos publicados</small><strong>{{ modPanel.eventosPublicados }}</strong></div><div><small>Revisiones pendientes</small><strong>{{ modPanel.revisionesPendientes }}</strong></div><div><small>Reportes pendientes</small><strong>{{ modPanel.reportesPendientes }}</strong></div><div><small>Cuentas suspendidas</small><strong>{{ modPanel.cuentasSuspendidas }}</strong></div><div><small>Auditoría</small><strong>{{ modPanel.auditoriaEstado }}</strong></div></div><div class="mod-tabs"><button v-for="tab in ['eventos','reportes','usuarios','auditoria','reglas']" :key="tab" :class="{ active: modTab === tab }" @click="modTab=tab">{{ tab }}</button></div><div class="panel-card"><div class="panel-head"><h2>{{ modTab[0].toUpperCase()+modTab.slice(1) }}</h2><div class="mod-controls"><input v-if="['eventos','usuarios'].includes(modTab)" v-model="modSearch" placeholder="Buscar" @keyup.enter="loadModTab"><select v-if="modTab==='eventos'" v-model="modStatus" @change="loadModTab"><option>EN_REVISION</option><option>CONFORME</option><option>DESACTIVADO</option></select><button v-if="modTab==='eventos' || modTab==='usuarios'" class="secondary-button" @click="loadModTab">Aplicar</button><button v-if="modTab==='reglas'" class="secondary-button" @click="createRule">＋ Nueva regla</button><button v-if="modTab==='auditoria'" class="secondary-button" @click="action(()=>api.exportarAuditoria(),'Auditoría descargada.')">Exportar CSV ↓</button></div></div><div v-if="modTab==='eventos'" class="data-table"><div v-for="event in modEvents" :key="event.eventoId" class="table-row"><div><b>{{ event.nombre }}</b><small>{{ event.organizadorNombre }} · {{ event.estadoModeracion }}</small></div><span>{{ event.reportesPendientes }} reportes</span><div class="row-actions"><button @click="inspectModerationEvent(event)">Detalle</button><button @click="moderate(event)">{{ event.estadoModeracion==='CONFORME' ? 'Suspender' : 'Aprobar' }}</button></div></div><div v-if="!modEvents.length" class="empty-inline">No hay eventos para revisar.</div><div v-if="modEventDetail" class="mod-detail"><h3>{{ modEventDetail.nombre }}</h3><p>Organiza {{ modEventDetail.organizadorNombre }} · {{ modEventDetail.estadoModeracion }} · Aforo {{ modEventDetail.aforoTotal }} · Reportes activos {{ modEventDetail.reportesActivos }}</p><div v-for="report in modEventDetail.reportes" :key="report.reporteId" class="mod-report">{{ report.origen }} · {{ report.motivo }} <small>{{ report.estado }}</small></div></div></div><div v-else-if="modTab==='reportes'" class="data-table"><div v-for="report in reports" :key="report.reporteId" class="table-row"><div><b>{{ report.eventoNombre }} · {{ report.origen }}</b><small>{{ report.motivo }} · {{ report.estado }}</small></div><span>{{ new Date(report.fechaReporte).toLocaleDateString('es-PE') }}</span><button v-if="report.estado==='PENDIENTE'" class="secondary-button" @click="resolveReport(report)">Resolver</button></div><div v-if="!reports.length" class="empty-inline">No hay reportes.</div></div><div v-else-if="modTab==='usuarios'" class="data-table"><div v-for="user in users" :key="user.usuarioId" class="table-row"><div><b>{{ user.nombre }}</b><small>{{ user.email }} · {{ user.estado }}</small></div><span>{{ (user.roles || []).join(', ') }}</span><div class="row-actions"><button @click="changeUser(user)">Cambiar estado</button><button v-if="!user.verificado" @click="verifyUser(user)">Verificar</button></div></div><div v-if="!users.length" class="empty-inline">Sin resultados.</div></div><div v-else-if="modTab==='auditoria'" class="data-table"><div v-for="entry in audit" :key="entry.auditoriaId" class="table-row"><div><b>{{ entry.accion }}</b><small>{{ entry.actor }} · {{ entry.detalle }}</small></div><span>{{ new Date(entry.fecha).toLocaleString('es-PE') }}</span></div><div v-if="!audit.length" class="empty-inline">Sin registros.</div></div><div v-else class="data-table"><div v-for="rule in rules" :key="rule.reglaId" class="table-row"><div><b>{{ rule.nombre }} <small>({{ rule.tipo }})</small></b><small>{{ rule.criterio }} · Acción: {{ rule.accion }}</small></div><span>{{ rule.activa ? 'Activa' : 'Inactiva' }}</span><button class="secondary-button" @click="toggleRule(rule)">{{ rule.activa ? 'Desactivar' : 'Activar' }}</button></div><div v-if="!rules.length" class="empty-inline">No hay reglas creadas.</div></div></div></template></section>
      </main>
      <footer class="app-footer"><span>EVENTIA · EVENTOS PARA VIVIRLOS</span><span>Hecho para encontrarnos · Perú</span></footer>
    </div>

    <div v-if="assistantOpen" class="assistant-overlay" @click="assistantOpen=false"></div>
    <aside class="assistant-dock" :class="{ open: assistantOpen }" :aria-hidden="!assistantOpen"><button class="assistant-close icon-button" aria-label="Cerrar asistente" @click="assistantOpen=false"><AppIcon name="close" /></button><EventAssistant :key="profile.usuarioId" :name="profile.nombre" :user-id="profile.usuarioId" :open="assistantOpen" @open-event="openEvent" /></aside>
    <button class="assistant-mobile-toggle primary-button" :aria-expanded="assistantOpen" @click="assistantOpen=!assistantOpen"><AppIcon name="bot" />{{ assistantOpen ? 'Cerrar asistente' : 'Pregúntale a Eventia' }}</button>
    <div v-if="selectedTicket" class="modal-backdrop" @click.self="selectedTicket=null"><article class="checkout-modal ticket-modal" role="dialog" aria-modal="true" aria-label="Entrada para asistir al evento"><button type="button" class="modal-close" aria-label="Cerrar entrada" @click="selectedTicket=null">×</button><div class="section-kicker">TU ACCESO AL EVENTO</div><h2>{{ selectedTicket.eventoTitulo || 'Entrada #' + selectedTicket.entradaId }}</h2><QrCode :value="selectedTicket.codigoQr" /><strong>{{ selectedTicket.titularNombre }}</strong><p>Muestra este QR al equipo de ingreso cuando llegues al evento.</p><small>Entrada #{{ selectedTicket.entradaId }} · {{ selectedTicket.tipoAcceso }}</small></article></div>
    <div v-if="checkoutOpen" class="modal-backdrop" @click.self="!busy && (checkoutOpen=false)"><form class="checkout-modal" @submit.prevent="buyTickets"><button type="button" class="modal-close" :disabled="busy" @click="checkoutOpen=false">×</button><div class="section-kicker">RESERVA TU LUGAR</div><h2>Comprar entradas</h2><label>Cantidad (máximo 4)<select v-model.number="checkout.cantidad" @change="resizeAttendees"><option v-for="n in 4" :key="n" :value="n">{{ n }}</option></select></label><label>Método de pago<select v-model="checkout.metodoPago"><option>YAPE</option><option>PLIN</option><option>TARJETA</option></select></label><div v-for="(person,index) in checkout.asistentes" :key="index" class="attendee-fields"><b>Asistente {{ index+1 }}</b><input v-model="person.titularNombre" placeholder="Nombre completo" required><input v-model="person.titularDocumento" placeholder="Documento" required></div><p class="checkout-total">Total: S/ {{ (Number(eventDetail?.precio || 0) * checkout.cantidad).toFixed(2) }}</p><button class="primary-button" :disabled="busy">{{ busy ? 'Registrando compra…' : 'Confirmar compra' }}</button><small>Esta versión registra la compra con el método elegido; no realiza un cobro bancario.</small></form></div>
    <div v-if="message" class="toast" role="status">{{ message }}</div>
  </div>
</template>
