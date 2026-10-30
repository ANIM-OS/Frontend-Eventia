<script setup>
defineProps({ name: { type: String, required: true } })
const icons = {
  ticket: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4Z', 'M15 5v3m0 3v2m0 3v3'],
  search: ['M21 21l-5-5', 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],
  pin: ['M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  grid: ['M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z'],
  calendar: ['M8 2v4m8-4v4M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'],
  plus: ['M12 5v14M5 12h14'],
  arrow: ['M5 12h14m-6-6 6 6-6 6'],
  chevron: ['m6 9 6 6 6-6'],
  sparkles: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4'],
  bot: ['M12 2v3M3 10H1m22 0h-2M7 21v-3m10 3v-3', 'M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'M8 10v2m8-2v2m-7 3h6'],
  send: ['m22 2-7 20-4-9-9-4ZM22 2 11 13'],
  shield: ['M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6Z', 'm8 12 3 3 5-5'],
  close: ['m6 6 12 12M6 18 18 6'],
  user: ['M20 21v-2a7 7 0 0 0-14 0v2', 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
}
</script>

<template><svg class="app-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-for="path in icons[name] || icons.ticket" :key="path" :d="path" /></svg></template>
