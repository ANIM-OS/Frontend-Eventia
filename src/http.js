export async function ensureSuccess(response) {
  if (response.ok) return response
  let message = `Error ${response.status}`
  try {
    const body = await response.json()
    message = body.mensaje || body.title || body.message || message
    if (body.errors) message = Object.values(body.errors).flat().join(' ')
  } catch { /* La API puede responder sin un cuerpo JSON. */ }
  const error = new Error(message)
  error.status = response.status
  throw error
}

export async function jsonBody(response) {
  if (!response || response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}
