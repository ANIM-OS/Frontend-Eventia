<script setup>
import { computed } from 'vue'

// US-09: barra de progreso del aforo (vendidas frente al aforo total)
const props = defineProps({
  aforoTotal: { type: Number, default: 0 },
  vendidas: { type: Number, default: 0 },
  compact: Boolean,
})
const porcentaje = computed(() => props.aforoTotal > 0 ? Math.min(100, Math.round(100 * props.vendidas / props.aforoTotal)) : 0)
const cupos = computed(() => Math.max(0, props.aforoTotal - props.vendidas))
const nivel = computed(() => cupos.value === 0 ? 'agotado' : porcentaje.value >= 80 ? 'alto' : 'normal')
</script>

<template>
  <div class="barra-aforo" :class="[nivel, { compact }]">
    <div class="barra-aforo-track" role="progressbar" :aria-valuenow="porcentaje" aria-valuemin="0" aria-valuemax="100"
         :aria-label="`Aforo: ${vendidas} de ${aforoTotal} vendidas`">
      <span :style="{ width: porcentaje + '%' }"></span>
    </div>
    <small v-if="!compact">{{ vendidas }} / {{ aforoTotal }} vendidas · {{ cupos === 0 ? 'Agotado' : cupos + ' cupos disponibles' }}</small>
  </div>
</template>
