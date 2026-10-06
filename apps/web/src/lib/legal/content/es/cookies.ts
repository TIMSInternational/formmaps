import type { LegalDocumentContent } from "../../types";
import { LEGAL_CONTACT as C, LEGAL_ENTITY as E } from "../../company";

const privacy = `[${C.privacyEmail}](mailto:${C.privacyEmail})`;

export const cookiesEs: LegalDocumentContent = {
  key: "cookies",
  locale: "es",
  title: "Aviso de Cookies",
  summary:
    "FormMaps usa unas pocas cookies y elementos de almacenamiento del navegador para mantener tu sesión iniciada y recordar tus elecciones. La analítica solo funciona si la aceptas. No usamos cookies publicitarias.",
  sections: [
    {
      id: "what",
      title: "1. Qué son las cookies y el almacenamiento local",
      blocks: [
        {
          type: "p",
          text: "Las cookies son pequeños archivos que un sitio web guarda en tu navegador. El almacenamiento local es una función parecida del navegador que guarda datos en tu dispositivo. Usamos ambos solo para los fines que se indican abajo.",
        },
      ],
    },
    {
      id: "necessary",
      title: "2. Estrictamente necesarias",
      blocks: [
        { type: "p", text: "Son necesarias para que FormMaps funcione y para mantener tu cuenta segura. No se pueden desactivar." },
        {
          type: "table",
          head: ["Nombre", "Tipo", "Finalidad", "Duración"],
          rows: [
            ["access_token", "Cookie (HttpOnly, segura)", "Mantiene tu sesión iniciada", "Hasta que vence tu sesión"],
            ["refresh_token", "Cookie (HttpOnly, segura)", "Renueva tu sesión de forma segura", "Hasta que vence tu sesión"],
            ["logged_in", "Cookie", "Le indica a la app que iniciaste sesión", "Hasta que vence tu sesión"],
            ["session_expires_at", "Cookie", "Te avisa antes de que tu sesión expire", "Hasta que vence tu sesión"],
            ["telemetry_consent", "Almacenamiento local", "Recuerda tus elecciones sobre cookies", "Hasta que lo borres o actualicemos este aviso"],
            ["timcare-global-store", "Almacenamiento local", "Guarda el estado de tu sesión y tus preferencias (como el idioma) en la app", "Hasta que cierres sesión o lo borres"],
            ["Progreso de evaluaciones (mil_session_*, formmaps_pending_mil_submissions, onboarding_*)", "Almacenamiento local", "Guarda tu progreso para que no pierdas respuestas si se cae la conexión", "Hasta que termines la evaluación o el proceso de bienvenida"],
          ],
        },
        {
          type: "p",
          text: "Nuestras cookies de sesión usan la protección SameSite, que ayuda a prevenir la falsificación de solicitudes entre sitios (CSRF).",
        },
      ],
    },
    {
      id: "preferences",
      title: "3. Preferencias",
      blocks: [
        {
          type: "table",
          head: ["Nombre", "Tipo", "Finalidad", "Duración"],
          rows: [
            ["i18nextLng", "Almacenamiento local", "Recuerda tu idioma (inglés o español)", "Hasta que lo borres"],
            ["admin-theme", "Almacenamiento local", "Recuerda la configuración de visualización en los paneles del personal", "Hasta que lo borres"],
          ],
        },
      ],
    },
    {
      id: "analytics",
      title: "4. Analítica (solo si la aceptas)",
      blocks: [
        {
          type: "p",
          text: "Si eliges \"Aceptar todo\" o activas Analítica en el aviso de cookies, la app envía eventos de uso (como páginas vistas y mediciones de rendimiento) a los servidores de FormMaps para que podamos mejorar el producto. Ningún servicio externo de analítica los recibe. Si eliges \"Solo necesarias\", no se envía ningún evento de analítica.",
        },
      ],
    },
    {
      id: "advertising",
      title: "5. Sin cookies publicitarias",
      blocks: [
        {
          type: "p",
          text: "No usamos cookies publicitarias ni de seguimiento entre sitios, y no permitimos que los anunciantes coloquen cookies a través de FormMaps. Cuando pagas, se te lleva a la página de pago de Stripe, donde Stripe usa sus propias cookies para la seguridad de los pagos y la prevención de fraudes, según su propia política de privacidad.",
        },
      ],
    },
    {
      id: "manage",
      title: "6. Cómo administrar tus elecciones",
      blocks: [
        {
          type: "ul",
          items: [
            "Para cambiar tu elección sobre la analítica, borra el elemento \"telemetry_consent\" (o todos los datos del sitio) en tu navegador; el aviso de cookies volverá a aparecer.",
            "Puedes bloquear o eliminar cookies en la configuración de tu navegador. Si bloqueas las cookies estrictamente necesarias, no podrás iniciar sesión.",
            "Al cerrar sesión se eliminan las cookies de sesión.",
          ],
        },
      ],
    },
    {
      id: "contact",
      title: "7. Cambios y contacto",
      blocks: [
        {
          type: "p",
          text: `Actualizamos este aviso cuando cambian las cookies que usamos. Preguntas: ${privacy}. Más información sobre cómo usamos los datos personales: [Política de Privacidad](/privacy). ${E.name} — ${E.product}.`,
        },
      ],
    },
  ],
};
