<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { api } from './api'
import AppIcon from './AppIcon.vue'

const props = defineProps({ name: { type: String, default: '' }, userId: { type: [String, Number], default: '' }, open: { type: Boolean, default: false } })
defineEmits(['open-event'])
const firstName = computed(() => props.name.split(' ')[0] || 'Hola')
const input = ref(''), sending = ref(false), conversation = ref([]), messageList = ref(null)
const storageKey = computed(() => props.userId ? `eventia.chat.v1:${props.userId}` : '')
const prompts = ['¿Qué eventos hay este fin de semana?', 'Busco eventos gratuitos', 'Eventos de tecnología en Lima']
let nextMessageId = 0
let disposed = false
onUnmounted(() => { disposed = true })
function restoreConversation() {
  if (!storageKey.value) { conversation.value = []; nextMessageId = 0; return }
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey.value) || '[]')
    conversation.value = Array.isArray(stored) ? stored.filter(message => ['user', 'assistant'].includes(message?.role) && typeof message.text === 'string').slice(-80) : []
    nextMessageId = conversation.value.reduce((max, message) => Math.max(max, Number(message.id) || 0), 0)
  } catch { conversation.value = []; nextMessageId = 0 }
}
function persistConversation(messages) {
  if (!storageKey.value) return
  try {
    if (!messages.length) { localStorage.removeItem(storageKey.value); return }
    const history = messages.slice(-80).map(({ id, role, text, error, sources }) => ({
      id, role, text: String(text).slice(0, 5000), ...(error ? { error: String(error).slice(0, 500) } : {}),
      ...(Array.isArray(sources) ? { sources: sources.slice(0, 5).map(source => ({ eventoId: source.eventoId, evento: source.evento, fechaInicio: source.fechaInicio, precio: source.precio })) } : {}),
    }))
    localStorage.setItem(storageKey.value, JSON.stringify(history))
  } catch { /* La conversación sigue disponible en memoria si el almacenamiento del navegador está lleno o bloqueado. */ }
}
watch(storageKey, restoreConversation, { immediate: true })
watch(conversation, persistConversation, { deep: true })
watch(() => props.open, open => { if (open) scrollToLatest() })
async function scrollToLatest() { await nextTick(); messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior: 'smooth' }) }
async function send(prompt = input.value, existingMessage = null) {
  const question = prompt.trim()
  if (!question || question.length > 1000 || sending.value) return
  sending.value = true; input.value = ''
  const userMessage = existingMessage || { id: ++nextMessageId, role: 'user', text: question }
  userMessage.error = ''
  if (!existingMessage) conversation.value.push(userMessage)
  await scrollToLatest()
  try {
    const history = conversation.value
      .filter(message => !message.error && ['user', 'assistant'].includes(message.role))
      .slice(-10)
      .filter(message => message.id !== userMessage.id)
      .map(message => ({
        role: message.role,
        content: message.text,
        eventIds: message.role === 'assistant' ? (message.sources || []).map(source => Number(source.eventoId)).filter(Number.isInteger) : [],
      }))
    const response = await api.chat(question, history)
    if (!disposed) conversation.value.push({ id: ++nextMessageId, role: 'assistant', text: response.answer || 'No encontré información suficiente para responder.', sources: response.sources || [] })
  } catch (failure) {
    if (!disposed) userMessage.error = failure.status === 404
      ? 'El asistente aún no está habilitado en la API que estás usando. Puedes explorar la cartelera con los filtros de búsqueda.'
      : failure.status === 503
        ? 'El servicio de IA no está disponible. Comprueba que Ollama siga iniciado y vuelve a intentarlo.'
        : failure.message || 'No se pudo conectar con el asistente.'
  } finally { sending.value = false; if (!disposed) await scrollToLatest() }
}
function clearConversation() { if (!sending.value) conversation.value = [] }
</script>

<template>
  <aside class="discovery-aside" aria-label="Ayuda para encontrar eventos">
    <section class="assistant-panel">
      <header class="assistant-header"><span class="assistant-avatar"><AppIcon name="bot" /></span><div><h2>Eventia Asistente</h2><p>Encuentra tu próximo evento</p></div><button v-if="conversation.length" class="chat-clear" :disabled="sending" @click="clearConversation">Limpiar</button><span class="assistant-indicator" title="Asistente de eventos"></span></header>
      <div ref="messageList" class="assistant-messages" role="log" aria-live="polite" aria-label="Conversación con el asistente">
        <div class="chat-message assistant"><span class="chat-avatar"><AppIcon name="sparkles" /></span><div class="chat-bubble">¡Hola, {{ firstName }}! ¿Qué te gustaría hacer? Cuéntame qué tipo de evento buscas, dónde y cuánto quieres gastar.</div></div>
        <div v-for="message in conversation" :key="message.id" class="chat-entry">
          <div class="chat-message" :class="message.role"><span v-if="message.role === 'assistant'" class="chat-avatar"><AppIcon name="sparkles" /></span><div class="chat-bubble"><p>{{ message.text }}</p><div v-if="message.sources?.length" class="chat-sources"><button v-for="source in message.sources" :key="source.eventoId" @click="$emit('open-event', source.eventoId)"><div><strong>{{ source.evento }}</strong><span>{{ new Date(source.fechaInicio).toLocaleDateString('es-PE') }} · {{ Number(source.precio) === 0 ? 'Gratis' : 'S/ ' + Number(source.precio).toFixed(2) }}</span></div><AppIcon name="arrow" /></button></div></div></div>
          <div v-if="message.error" class="chat-failure" role="alert"><p>{{ message.error }}</p><button :disabled="sending" @click="send(message.text, message)">Reintentar</button></div>
        </div>
        <div v-if="sending" class="chat-message assistant"><span class="chat-avatar"><AppIcon name="sparkles" /></span><div class="chat-bubble chat-loading" role="status">Buscando eventos<span>…</span></div></div>
      </div>
      <div class="assistant-prompts"><button v-for="prompt in prompts" :key="prompt" :disabled="sending" @click="send(prompt)">{{ prompt }}</button></div>
      <form class="assistant-compose" @submit.prevent="send()"><input v-model="input" maxlength="1000" placeholder="Escribe tu consulta…" aria-label="Consulta al asistente" :disabled="sending"><button :disabled="sending || !input.trim()" aria-label="Enviar consulta"><AppIcon name="send" /></button></form>
    </section>
    <div class="booking-note"><AppIcon name="shield" /><div><h3>Tu entrada, siempre contigo</h3><p>Revisa tus compras y muestra tu QR desde el celular al llegar al evento.</p><div class="payment-methods"><span>Yape</span><span>Plin</span><span>Tarjeta</span></div></div></div>
  </aside>
</template>
