<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { api } from './api'

// US-07: el QR lleva un token firmado por el servidor que vence a los pocos segundos.
// Se pide a GET /api/Entrada/{id}/qr y se renueva solo antes de que expire.
const props = defineProps({ entradaId: { type: Number, required: true }, evento: { type: String, default: '' } })
const emit = defineEmits(['no-disponible'])

const image = ref(''), error = ref(''), garantia = ref(''), restantes = ref(0), loading = ref(false)
const contenedor = ref(null)
let expiraEn = 0, renovar = null, reloj = null, activo = true

const vigente = computed(() => Boolean(image.value) && restantes.value > 0)

async function cargar() {
  clearTimeout(renovar)
  if (!activo) return
  loading.value = true; error.value = ''
  try {
    const qr = await api.qrEntrada(props.entradaId)
    if (!activo) return
    image.value = await QRCode.toDataURL(qr.token, { width: 360, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#003f7d', light: '#ffffff' } })
    garantia.value = qr.garantia || ''
    // Usamos los segundos de validez (no la hora del servidor) para no depender del reloj del celular
    expiraEn = Date.now() + (qr.segundosValidez || 24) * 1000
    actualizarContador()
    renovar = setTimeout(cargar, Math.max(3, (qr.segundosValidez || 24) - 4) * 1000)
  } catch (failure) {
    if (!activo) return
    image.value = ''
    error.value = failure.message || 'No se pudo generar el QR.'
    // 400/403/404: la entrada ya se usó, se anuló o no es tuya; no tiene sentido seguir pidiendo
    if ([400, 403, 404].includes(failure.status)) emit('no-disponible', error.value)
    else renovar = setTimeout(cargar, 5000)
  } finally { loading.value = false }
}
function actualizarContador() { restantes.value = Math.max(0, Math.ceil((expiraEn - Date.now()) / 1000)) }

async function pantallaCompleta() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await contenedor.value?.requestFullscreen?.()
  } catch { /* algunos navegadores no permiten pantalla completa */ }
}
function nombreArchivo() { return `entrada-${props.entradaId}.png` }
function descargar() {
  if (!image.value) return
  const link = document.createElement('a')
  link.href = image.value; link.download = nombreArchivo()
  document.body.append(link); link.click(); link.remove()
}
async function compartir() {
  if (!image.value) return
  const texto = `Mi entrada #${props.entradaId}${props.evento ? ' para ' + props.evento : ''}. El QR se renueva cada pocos segundos: muéstralo desde la app al ingresar.`
  try {
    const blob = await (await fetch(image.value)).blob()
    const archivo = new File([blob], nombreArchivo(), { type: 'image/png' })
    if (navigator.canShare?.({ files: [archivo] })) await navigator.share({ title: 'Mi entrada · Eventia', text: texto, files: [archivo] })
    else if (navigator.share) await navigator.share({ title: 'Mi entrada · Eventia', text: texto })
    else { await navigator.clipboard?.writeText(texto); error.value = 'Tu navegador no permite compartir; copiamos los datos de la entrada.' }
  } catch { /* el usuario canceló */ }
}

watch(() => props.entradaId, cargar, { immediate: true })
reloj = setInterval(actualizarContador, 1000)
// Al volver a la pestaña el token pudo vencer: pedimos uno nuevo
function alVolver() { if (document.visibilityState === 'visible' && restantes.value <= 2) cargar() }
document.addEventListener('visibilitychange', alVolver)
onUnmounted(() => { activo = false; clearTimeout(renovar); clearInterval(reloj); document.removeEventListener('visibilitychange', alVolver) })
</script>

<template>
  <div ref="contenedor" class="qr-dinamico">
    <img v-if="image" class="ticket-qr-image" :class="{ vencido: !vigente }" :src="image" alt="Código QR dinámico de la entrada">
    <div v-else class="qr-cargando" role="status">{{ error || 'Generando QR seguro…' }}</div>
    <p class="qr-estado" role="status">
      <span class="qr-pulso" :class="{ activo: vigente }"></span>
      {{ vigente ? `Validación en tiempo real activa · se renueva en ${restantes} s` : (loading ? 'Renovando código…' : 'Código no disponible') }}
    </p>
    <div class="qr-acciones">
      <button type="button" class="secondary-button" @click="pantallaCompleta">Pantalla completa</button>
      <button type="button" class="secondary-button" :disabled="!image" @click="descargar">Descargar</button>
      <button type="button" class="secondary-button" :disabled="!image" @click="compartir">Compartir</button>
    </div>
    <p v-if="garantia" class="qr-garantia">🔒 {{ garantia }}</p>
    <p v-if="error && image" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>
