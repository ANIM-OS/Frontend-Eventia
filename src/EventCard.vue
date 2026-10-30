<script setup>
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
const props = defineProps({ event: { type: Object, required: true }, compact: Boolean })
defineEmits(['select'])
const imageFailed = ref(false)
watch(() => props.event.imagenUrl, () => { imageFailed.value = false })
const price = computed(() => Number(props.event.precio || 0) === 0 ? 'Gratis' : `S/ ${Number(props.event.precio).toFixed(2)}`)
const availability = computed(() => {
  if (props.event.finalizado) return 'Finalizado'
  if (props.event.agotado || props.event.cuposDisponibles === 0) return 'Agotado'
  if (props.event.cuposDisponibles > 0 && props.event.cuposDisponibles <= 20) return `Quedan ${props.event.cuposDisponibles} cupos`
  return 'Disponible'
})
</script>

<template>
  <article class="event-card" :class="{ 'compact-card': compact }">
    <button class="card-image" @click="$emit('select', event.eventoId)" :aria-label="'Ver ' + event.nombre">
      <img v-if="event.imagenUrl && !imageFailed" :src="event.imagenUrl" :alt="event.nombre" loading="lazy" @error="imageFailed=true">
      <div v-else class="event-image-placeholder"><AppIcon name="ticket" /><span>{{ event.categoriaNombre || 'Una nueva experiencia' }}</span></div>
      <span class="card-category">{{ event.categoriaNombre || 'Evento' }}</span>
    </button>
    <div class="card-content">
      <div class="card-date"><AppIcon name="calendar" /><span>{{ new Date(event.fechaInicio).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) }} · {{ event.distrito || event.provincia || event.sede }}</span></div>
      <button class="card-title" @click="$emit('select', event.eventoId)">{{ event.nombre }}</button>
      <p v-if="!compact" class="card-description">{{ event.descripcion || event.sede }}</p>
      <div class="card-footer"><div><span class="availability" :class="{ scarce: event.cuposDisponibles <= 20, unavailable: event.finalizado || event.agotado }">{{ availability }}</span><strong class="card-price">{{ price }}</strong></div><button class="primary-button card-cta" @click="$emit('select', event.eventoId)">{{ compact || event.finalizado || event.agotado ? 'Ver evento' : Number(event.precio) === 0 ? 'Inscribirme' : 'Comprar' }}</button></div>
    </div>
  </article>
</template>
