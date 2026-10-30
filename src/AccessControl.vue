<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { api } from './api'
import { accessStatus, isPublished } from './eventLogic'

const props = defineProps({ events: { type: Array, default: () => [] }, eventId: { type: [Number, String], default: '' } })
const selectedId = ref(props.eventId), code = ref(''), scanning = ref(false), submitting = ref(false), result = ref(null), error = ref('')
const cameraInput = ref(null), photoInput = ref(null), now = ref(new Date())
const clock = setInterval(() => { now.value = new Date() }, 30000)
let disposed = false
onUnmounted(() => { disposed = true; clearInterval(clock) })
const events = computed(() => props.events.filter(event => isPublished(event) && !event.finalizado && new Date(event.fechaFin) > now.value))
const event = computed(() => events.value.find(item => item.eventoId === Number(selectedId.value)))
const status = computed(() => accessStatus(event.value, now.value))
const locked = computed(() => scanning.value || submitting.value)
watch(() => props.eventId, value => { selectedId.value = value })
watch(selectedId, () => { code.value = ''; result.value = null; error.value = '' })
watch(code, () => { result.value = null; error.value = '' })

async function readPhoto(change) {
  const file = change.target.files?.[0]
  if (!file || locked.value) return
  scanning.value = true; code.value = ''; result.value = null; error.value = ''
  let cleanup = () => {}
  try {
    let image
    if (typeof createImageBitmap === 'function') {
      image = await createImageBitmap(file); cleanup = () => image.close?.()
    } else {
      const url = URL.createObjectURL(file); cleanup = () => URL.revokeObjectURL(url)
      image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('No se pudo abrir la foto.')); img.src = url })
    }
    const scale = Math.min(1, 1800 / Math.max(image.width, image.height)), canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('No se pudo procesar la foto.')
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const { default: decodeQr } = await import('jsqr')
    const decoded = decodeQr(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' })
    if (!decoded?.data?.trim()) throw new Error('No encontramos un QR. Acerca el código y toma una foto nítida, sin reflejos.')
    if (!disposed) code.value = decoded.data.trim()
  } catch (failure) { if (!disposed) error.value = failure.message }
  finally { cleanup(); scanning.value = false; change.target.value = '' }
}
async function validate() {
  if (locked.value || !code.value.trim() || !status.value.allowed || result.value) return
  submitting.value = true; error.value = ''
  try { result.value = await api.validarEntrada({ eventoId: event.value.eventoId, codigoQr: code.value.trim() }) }
  catch (failure) { error.value = failure.message }
  finally { submitting.value = false }
}
function nextAttendee() { code.value = ''; result.value = null; error.value = '' }
</script>

<template>
  <div class="panel-card access-panel">
    <div class="panel-head"><h2>Recibir asistentes</h2><span>Control en la entrada del evento</span></div>
    <p class="flow-copy">El asistente muestra su entrada QR. Como organizador, lee el código y confirma su ingreso una sola vez.</p>
    <label class="access-label">Evento<select v-model="selectedId" :disabled="locked"><option value="" disabled>Selecciona uno de tus eventos</option><option v-for="item in events" :key="item.eventoId" :value="item.eventoId">{{ item.nombre }} · {{ new Date(item.fechaInicio).toLocaleDateString('es-PE') }}</option></select></label>
    <p v-if="!events.length" class="empty-inline">No tienes eventos publicados con ingresos pendientes. Publica un evento desde “Mis eventos”.</p>
    <p v-else-if="selectedId && !event" class="access-note" role="status">El evento seleccionado ya no admite ingresos. Selecciona otro evento.</p>
    <template v-if="event">
      <div class="access-event"><strong>{{ event.nombre }}</strong><span>{{ event.sede }} · {{ new Date(event.fechaInicio).toLocaleString('es-PE') }}</span></div>
      <p class="access-note">{{ status.message }}</p>
      <form v-if="status.allowed" @submit.prevent="validate">
        <input ref="cameraInput" hidden type="file" accept="image/*" capture="environment" @change="readPhoto">
        <input ref="photoInput" hidden type="file" accept="image/*" @change="readPhoto">
        <div class="scan-actions"><button type="button" class="primary-button" :disabled="locked" @click="cameraInput.click()">{{ scanning ? 'Leyendo QR…' : 'Tomar foto del QR' }}</button><button type="button" class="secondary-button" :disabled="locked" @click="photoInput.click()">Elegir imagen</button></div>
        <p v-if="code && !result" class="scan-ready" role="status">QR leído. Confirma el ingreso del asistente.</p>
        <details v-if="!result" class="manual-code"><summary>Ingresar código manualmente</summary><input v-model="code" :disabled="locked" aria-label="Código de la entrada" placeholder="Código de la entrada" autocomplete="off"></details>
        <button v-if="!result" class="primary-button access-confirm" :disabled="locked || !code.trim()">{{ submitting ? 'Validando…' : 'Validar y registrar ingreso' }}</button>
      </form>
      <div v-if="result" class="access-result" :class="result.valida ? 'accepted' : 'rejected'" role="status"><strong>{{ result.valida ? 'Ingreso confirmado' : 'Acceso rechazado' }}</strong><p>{{ result.mensaje }}</p><span v-if="result.titularNombre">{{ result.titularNombre }} · {{ result.tipoAcceso }}</span><button type="button" class="secondary-button" @click="nextAttendee">Siguiente asistente</button></div>
    </template>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>
