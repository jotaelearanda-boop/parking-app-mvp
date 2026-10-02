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
- [ ] Registrar el **webhook de producción** en Stripe (endpoint de Railway) y poner `STRIPE_WEBHOOK_SECRET` en Railway.
- [ ] Verificar el dominio de Vercel en Stripe para **Apple Pay** y activar Google Pay en Ajustes → Métodos de pago.
- [ ] Probar un pago, una recarga, una disputa y una retirada completos en producción (modo test).
- [ ] Decidir cuándo pasar a modo **live** (claves `sk_live_` / `pk_live_`, Connect en live) — requiere verificar la cuenta de Stripe.
- [ ] Probar la retirada de saldo con el alta (KYC) de un vendedor de prueba.

## Google Maps
- [ ] Añadir el dominio de Vercel a las restricciones HTTP de la clave de Maps (y quitar `localhost` si ya no hace falta).

## Legal y privacidad
- [ ] **Consulta con abogado**: legalidad de vender/comprar plazas en vía pública en Alicante, saldo interno (dinero electrónico) y comisión.
- [ ] Política de privacidad (matrícula = dato personal, ubicación borrada tras 1 h) y términos de uso.
- [ ] Banner de cookies / consentimiento si procede.
- [ ] Aviso al usuario sobre el reembolso y las disputas (24 h).

## Infraestructura
- [ ] Servidor Railway en región **Europa** (ahora en US West) — latencia con Supabase (Irlanda).
- [ ] Revisar el plan de Railway (el trial dura 30 días / 5 $) y el de Supabase.
- [ ] `CLIENT_ORIGIN` en Railway = URL de Vercel (CORS).
- [ ] Revisar los límites de la geolocalización y el uso de la API de Google Maps.
- [ ] Monitorización de errores (p. ej. Sentry) y alertas del servidor.

## Producto / QA
- [ ] Probar en móvil real: GPS, instalar PWA, notificaciones, pago con Apple Pay / Google Pay.
- [ ] Confirmar las coordenadas reales de Aloná / García Andreu con una prueba en la calle.
- [ ] Notificaciones push reales (hoy solo avisos en la app abierta por WebSocket).
- [ ] Verificación real de email y teléfono (hoy no se envía el código).
- [ ] Probar el límite de 700 m de la geocerca desde la calle.
