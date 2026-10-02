// BORRADOR de textos legales para la beta. Deben ser revisados por un abogado antes del lanzamiento público
// y completar los datos entre corchetes del titular. Versión: 2026-10-beta (ver server/src/routes/auth.js).
const Pagina = ({ titulo, children }) => (
  <main className="mx-auto max-w-2xl space-y-3 p-5 pb-16 leading-relaxed">
    <a href="/" className="text-sm text-blue-600">← Volver</a>
    <h1 className="text-2xl font-bold">{titulo}</h1>
    <p className="rounded bg-yellow-50 p-2 text-sm text-yellow-900">Versión beta 2026-10 · Texto provisional sujeto a revisión legal.</p>
    {children}
  </main>
);
const H = ({ children }) => <h2 className="pt-3 text-lg font-semibold">{children}</h2>;

export function Terminos() {
  return (
    <Pagina titulo="Términos de uso">
      <H>1. Qué es esta aplicación</H>
      <p>Parking P2P es una plataforma que pone en contacto a conductores. Un usuario que va a dejar libre una plaza de aparcamiento en la vía pública puede avisar de ello, y otro usuario puede reservar el aviso a cambio de un precio. La plataforma <b>no vende ni alquila plazas</b>, no es propietaria de ellas ni garantiza que estén libres: solo facilita la comunicación y el pago entre usuarios.</p>
      <H>2. Responsabilidades del usuario</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>Cumplir la normativa de tráfico, de estacionamiento y las ordenanzas municipales. No se pueden ofrecer plazas en zonas reguladas (zona azul, naranja, carga y descarga, vados, reservas, etc.).</li>
        <li>Indicar datos veraces (también del vehículo) y ubicar la plaza donde realmente está tu coche.</li>
        <li>Salir de la plaza cuando confirmes la salida y tratar con respeto a la otra persona.</li>
      </ul>
      <H>3. Pagos, comisión y saldo</H>
      <p>El comprador paga el precio indicado. La plataforma retiene el importe hasta que el vendedor confirma su salida y cobra una comisión (20 % en la beta). El vendedor recibe el resto como <b>saldo de la aplicación</b>, que puede usar para pagar otras plazas o retirar a su cuenta bancaria tras verificar su identidad con nuestro proveedor de pagos (Stripe). El saldo es crédito de la aplicación, tiene un límite y no genera intereses.</p>
      <H>4. Reclamaciones y reembolsos</H>
      <p>Si compras una plaza y no está disponible, puedes reportar un problema desde la reserva. Si la reclamación no se resuelve en 24 horas, se reembolsa automáticamente el importe pagado.</p>
      <H>5. Reputación y suspensión</H>
      <p>Las valoraciones de 1 a 5 estrellas afectan a tu reputación. Podemos avisar, suspender temporalmente o dar de baja cuentas con valoraciones muy bajas, conductas fraudulentas o incumplimiento de estos términos.</p>
      <H>6. Limitación de responsabilidad</H>
      <p>La plataforma no responde de multas, retirada de vehículos, daños o conflictos entre usuarios derivados del uso de la vía pública. El servicio se ofrece en fase beta, sin garantía de disponibilidad.</p>
      <H>7. Titular y contacto</H>
      <p>[Titular: nombre o razón social pendiente] · [NIF/CIF] · [Domicilio] · [Email de contacto].</p>
    </Pagina>
  );
}

export function Privacidad() {
  return (
    <Pagina titulo="Política de privacidad y ubicación">
      <H>1. Responsable</H>
      <p>[Titular pendiente] · [NIF/CIF] · [Domicilio] · [Email de contacto y delegado de protección de datos, si procede].</p>
      <H>2. Qué datos tratamos</H>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Cuenta:</b> nombre, email, teléfono y contraseña (cifrada).</li>
        <li><b>Vehículo:</b> modelo, color y matrícula. Se muestran a la otra parte <u>solo</u> cuando hay una plaza pagada, para que os reconozcáis en la calle.</li>
        <li><b>Ubicación:</b> cuando pulsas «Vender mi plaza» usamos la ubicación de tu dispositivo (con tu permiso) y la que tú ajustas en el mapa. Al comprador se le muestra una ubicación aproximada y, tras pagar, la exacta de esa plaza.</li>
        <li><b>Pagos y saldo:</b> importes, movimientos y estado de las operaciones. Los datos de tarjeta los gestiona Stripe; nosotros no los vemos ni los guardamos.</li>
        <li><b>Actividad:</b> mensajes del chat de cada reserva, valoraciones y reclamaciones.</li>
      </ul>
      <H>3. Para qué y con qué base legal</H>
      <p>Prestar el servicio solicitado (ejecución del contrato): conectar vendedor y comprador, cobrar, gestionar el saldo y las reclamaciones. Prevenir el fraude y cumplir obligaciones legales (interés legítimo y obligación legal). La ubicación se trata con tu <b>consentimiento</b>, que puedes retirar desactivando el permiso de localización en tu navegador.</p>
      <H>4. Cuánto tiempo los conservamos</H>
      <p>La ubicación de cada plaza se <b>elimina 1 hora después</b> de cerrarse la venta (o de caducar el aviso). Los datos de cuenta, vehículo y operaciones se conservan mientras tengas cuenta y, después, durante los plazos legales aplicables (por ejemplo, fiscales y de pagos).</p>
      <H>5. Con quién los compartimos</H>
      <p>Proveedores que nos prestan servicio: Stripe (pagos), Supabase (base de datos, UE), Railway y Vercel (alojamiento) y Google Maps (mapas). Algunos pueden tratar datos fuera del Espacio Económico Europeo con las garantías legales correspondientes. No vendemos tus datos.</p>
      <H>6. Tus derechos</H>
      <p>Puedes acceder, rectificar, suprimir, oponerte, limitar el tratamiento y solicitar la portabilidad de tus datos escribiendo al email de contacto. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p>
      <H>7. Seguridad</H>
      <p>Usamos conexiones cifradas, contraseñas protegidas y registramos los accesos del personal autorizado a datos personales.</p>
    </Pagina>
  );
}
