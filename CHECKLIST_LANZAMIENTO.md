# Checklist antes de lanzar (beta / producción)

Marca cada punto antes de invitar a usuarios reales. Todo lo de abajo está pendiente.

## Seguridad de cuentas
- [ ] Activar **2FA** en Vercel (se omitió durante el deploy inicial).
- [ ] Activar 2FA en Railway, Supabase, Stripe, GitHub y Google Cloud.
- [ ] Revocar el Personal Access Token de GitHub usado en local y, si se necesita, crear uno nuevo con caducidad corta.

## Secretos expuestos durante el desarrollo (rotar)
- [ ] Supabase: **Reset database password** → actualizar `DATABASE_URL` en Railway y en `server/.env`.
- [ ] Stripe: *roll* de la `sk_test_` → actualizar en Railway y en `server/.env`.
- [ ] Generar un `JWT_SECRET` nuevo (`openssl rand -hex 32`) y ponerlo en Railway (esto cierra todas las sesiones).

## Datos y base de datos
- [ ] Borrar los usuarios, plazas, transacciones y saldos de **prueba** de Supabase.
- [ ] Marcar el usuario admin real (`update users set is_admin = true where email = '...'`).
- [ ] Activar la geocerca del piloto: `ZONA_ESTRICTA=true` en Railway.
- [ ] Comprobar copias de seguridad en Supabase.

## Pagos (Stripe)
- [x] Webhook de producción registrado en Stripe (endpoint clásico/snapshot `we_1UM8WE…`) y `STRIPE_WEBHOOK_SECRET` en Railway. Probado con un pago real en modo test.
- [ ] Borrar el destino de webhook sobrante creado por el asistente (`we_1UM8NT…`, estilo "Resumen"/thin, no lo usa el servidor).
- [ ] Al pasar a modo **live**, repetir: crear un endpoint nuevo en modo live y su `whsec_` propio.
- [ ] Verificar el dominio de Vercel en Stripe para **Apple Pay** y activar Google Pay en Ajustes → Métodos de pago.
- [ ] Probar un pago, una recarga, una disputa y una retirada completos en producción (modo test).
- [ ] Decidir cuándo pasar a modo **live** (claves `sk_live_` / `pk_live_`, Connect en live) — requiere verificar la cuenta de Stripe.
- [ ] Probar la retirada de saldo con el alta (KYC) de un vendedor de prueba.

## Entornos de Stripe (importante)
- La app usa las claves del sandbox **"Entorno de prueba de App_Parking"** (`acct_1ULlr1ROOi0SReSi`). El panel `acct_1UM4SVIxbH3x3qkI` es otro entorno (cuenta principal). Toda la configuración (webhooks, dominios de Apple Pay, Connect) debe hacerse **en el entorno de las claves**, o por API con la `sk_test`.
- [ ] Al pasar a modo live, repetir todo en la cuenta principal: claves live, webhook live, dominio para Apple Pay/Google Pay, Connect.

## Google Maps
- [x] Dominio de Vercel añadido a la clave de Maps. Pendiente: quitar `localhost` de las restricciones antes del lanzamiento público.

## Zonas reguladas (ORA)
- [ ] El portal de datos abiertos de Alicante **no publica** las zonas ORA y OpenStreetMap no tiene cobertura en Benalúa. Opciones: pedir al Ayuntamiento/concesionaria el plano oficial, o dibujar las calles a mano en Backoffice → Zonas (geojson.io).
- [ ] **Riesgo de negocio:** la ampliación de la ORA incluye Benalúa y Benalúa Sur. Comprobar si Aloná y García Andreu pasarán a zona azul/naranja y cuándo.
- [ ] Cargar todas las zonas azules/naranjas del piloto en el backoffice antes de abrir el beta.

## Backoffice
- [ ] Marcar como admin solo las cuentas reales de gestión (`is_admin`). Cada consulta de datos personales queda en la pestaña Auditoría.

## Legal y privacidad
- [ ] **Consulta con abogado**: legalidad de vender/comprar plazas en vía pública en Alicante, saldo interno (dinero electrónico) y comisión.
- [ ] Revisar con abogado los **borradores** de Términos y Privacidad (`client/src/pages/Legal.jsx`) y rellenar los datos del titular `[entre corchetes]`. Al cambiar los textos, subir `POLITICAS_VERSION` en `server/src/routes/auth.js` para que todos vuelvan a aceptar.
- [ ] Banner de cookies / consentimiento si procede.
- [ ] Aviso al usuario sobre el reembolso y las disputas (24 h).

## Infraestructura
- [ ] Servidor Railway en región **Europa** (ahora en US West) — latencia con Supabase (Irlanda).
- [ ] Revisar el plan de Railway (el trial dura 30 días / 5 $) y el de Supabase.
- [x] `CLIENT_ORIGIN` en Railway = URL de Vercel (CORS).
- [ ] Dominio propio para la app (ahora `parking-app-mvp-beryl.vercel.app`) y actualizar `CLIENT_ORIGIN`, Maps y Stripe.
- [ ] Revisar los límites de la geolocalización y el uso de la API de Google Maps.
- [ ] Monitorización de errores (p. ej. Sentry) y alertas del servidor.

## Producto / QA
- [ ] Probar en móvil real: GPS, instalar PWA, notificaciones, pago con Apple Pay / Google Pay.
- [ ] Confirmar las coordenadas reales de Aloná / García Andreu con una prueba en la calle.
- [ ] Notificaciones push reales (hoy solo avisos en la app abierta por WebSocket).
- [ ] Verificación real de email y teléfono (hoy no se envía el código).
- [ ] Probar el límite de 700 m de la geocerca desde la calle.
