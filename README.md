# Eventia · Frontend

Aplicación Vue 3 para el backend de EventosPeruIA. Incluye descubrimiento de eventos, filtros, recomendaciones, perfiles, gestión de eventos, ventas, compras, entradas QR, reseñas, notificaciones y panel de moderación.

## Iniciar en desarrollo

1. Inicia la API con el perfil HTTPS (`https://localhost:7224`) y su base de datos.
2. Desde esta carpeta instala dependencias y levanta Vite:

   ```sh
   npm install
   npm run dev
   ```

Vite reenvía `/api` a la API local. Cambia `VITE_API_PROXY_TARGET` en `.env.local` si el backend usa otro host o puerto. Si se ejecuta solo el perfil HTTP, configura el proxy a `http://localhost:5295`.

## Autenticación

Login y Registro usan usuario/correo y contraseña con Firebase Authentication. Copia `.env.example` como `.env.local` y completa las variables `VITE_FIREBASE_*` con la configuración web del proyecto Firebase. Después de autenticar, el frontend llama a `POST /api/Usuario/registro` para crear el perfil. La API del proyecto no guarda contraseñas ni ofrece autenticación local.

En producción, publica el frontend detrás de un proxy de mismo origen para que `/api` llegue al backend, o define `VITE_API_BASE_URL` con la URL pública de la API y habilita CORS en el backend para el dominio del frontend.

## Alcance y límites del backend

- El flujo de compra registra el método de pago y genera entradas con QR; el backend revisado no integra una pasarela de pago.
- La lista de compras devuelve los detalles y entradas asociados. Se corrigió el endpoint `GET /api/Compra/mis-compras`, que antes respondía solo con un mensaje.
- El frontend requiere la configuración web de Firebase para habilitar los botones de acceso.

## Recorridos de uso

- **Asistente:** descubrir un evento → registrar la compra → abrir Mis entradas → mostrar el QR en el ingreso. Después del evento, Reseñas muestra las valoraciones pendientes que devuelve la API.
- **Organizador:** Mis eventos → crear un borrador → revisar y publicar. La edición, las ventas y el control de ingreso tienen pantallas separadas.
- **Ingreso al evento:** Control de acceso → seleccionar un evento propio publicado → tomar una foto del QR o elegir una imagen → confirmar el ingreso → siguiente asistente. La lectura de la foto no registra asistencia por sí sola. La API confirma la entrada, la propiedad del evento y el uso previo del QR.
- El frontend habilita los ingresos el día de inicio según America/Lima y los bloquea cuando el evento termina. Esa restricción temporal es una regla de interfaz; la API revisada no la impone todavía.
- Las entradas usadas o anuladas no muestran un QR utilizable. Las compras permiten encontrar las entradas sin introducir identificadores manualmente.
- Los datos se limpian al cambiar de cuenta; los errores de autenticación, bloqueo y conexión no se presentan como un registro de perfil pendiente.

## Verificación local

`npm test` comprueba reglas de fechas y estados, correspondencia de compras/entradas, respuestas HTTP y lectura del QR generado. `npm run build` comprueba la compilación del frontend. Estas comprobaciones no sustituyen un recorrido autenticado contra la API y su base de datos.
