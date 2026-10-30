<script setup>
import { ref, watch } from 'vue'
import QRCode from 'qrcode'

const props = defineProps({ value: { type: String, required: true } })
const image = ref('')
const failed = ref(false)

watch(() => props.value, async (value, previous, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  image.value = ''; failed.value = false
  if (!value) return
  try {
    const source = await QRCode.toDataURL(value, {
        width: 320,
        margin: 4,
        color: { dark: '#003f7d', light: '#ffffff' },
      })
    if (current) image.value = source
  } catch { if (current) failed.value = true }
}, { immediate: true })
</script>

<template>
  <img v-if="image" class="ticket-qr-image" :src="image" alt="Código QR de la entrada">
  <span v-else-if="failed" role="alert">No se pudo generar el QR. Actualiza tus entradas.</span>
</template>
