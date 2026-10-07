import type { LegalDocumentContent } from "../../types";
import { LEGAL_CONTACT as C, LEGAL_ENTITY as E } from "../../company";

const privacy = `[${C.privacyEmail}](mailto:${C.privacyEmail})`;

export const privacyEs: LegalDocumentContent = {
  key: "privacy",
  locale: "es",
  title: "Política de Privacidad",
  summary:
    "Esta política explica qué datos personales recopila FormMaps, para qué, quién nos ayuda a tratarlos y qué derechos tienen tú y tu madre, padre o tutor. Los resultados de las evaluaciones son sensibles, sobre todo para estudiantes menores de 18 años, por eso solo los tratamos con la autorización requerida, nunca vendemos datos personales y nunca los usamos para publicidad dirigida.",
  sections: [
    {
      id: "controller",
      title: "1. Quién es responsable de tus datos",
      blocks: [
        {
          type: "p",
          text: `El responsable del tratamiento es **${E.name}**, ${E.descriptionEs}, que opera ${E.product}. Contacto para cualquier tema de privacidad: ${privacy}.`,
        },
        {
          type: "p",
          text: "Si usas FormMaps a través de un colegio, el colegio también decide cómo se usan algunos de tus datos (por ejemplo, qué orientadores y profesores pueden ver tu progreso). En ese caso, el colegio es responsable de su propio uso de los datos, y nosotros los tratamos siguiendo sus instrucciones.",
        },
      ],
    },
    {
      id: "data-we-collect",
      title: "2. Qué datos recopilamos",
      blocks: [
        {
          type: "ul",
          items: [
            "**Datos de cuenta e identidad:** nombre, correo electrónico, contraseña (guardada solo como un hash seguro), rol (estudiante, madre o padre, orientador, etc.), idioma y preferencias.",
            "**Fecha de nacimiento:** para aplicar nuestras reglas de edad y saber cuándo se necesita el permiso de la madre, padre o tutor.",
            "**Datos de la madre, padre o tutor:** nombre y datos de contacto de la madre, padre o tutor que da el permiso, paga o participa en las evaluaciones.",
            "**Datos del colegio:** nombre del colegio, grado, clases y los orientadores o profesores vinculados a tu cuenta, cuando te unes a través de un colegio.",
            "**Respuestas y resultados de evaluaciones:** tus respuestas y resultados en nuestras evaluaciones: el PCA (perfil conductual, modelo DISC), el LIA (aptitudes cognitivas), Personalidad y Vocacional 360 (que incluye evaluaciones sobre ti completadas por madres, padres o profesores que invites).",
            "**Datos académicos y de planificación:** calificaciones, cursos, metas, intereses, listas de universidades y carreras, y los planes que creas.",
            "**Hojas de vida y postulaciones:** hojas de vida, cartas de presentación, ensayos e información de postulaciones que escribes o subes.",
            "**Mensajes y sesiones:** mensajes con orientadores o coaches y, cuando se ofrece, registros de sesiones de video (hora y participantes, no grabaciones, salvo que se te informe lo contrario).",
            "**Datos de pago:** Stripe procesa tu tarjeta. Solo recibimos información limitada (como el plan, el monto, el estado, los últimos cuatro dígitos y la marca de la tarjeta). **No guardamos números de tarjeta completos.**",
            "**Datos técnicos y registros:** dirección IP, tipo de dispositivo y navegador, páginas visitadas, reportes de errores y registros de seguridad.",
            "**Cookies y tecnologías similares:** consulta nuestro [Aviso de Cookies](/cookies).",
          ],
        },
      ],
    },
    {
      id: "sensitive-data",
      title: "3. Datos sensibles",
      blocks: [
        {
          type: "p",
          text: "Tratamos **las respuestas y los resultados de las evaluaciones psicométricas como datos sensibles**, y damos protección adicional a todos los datos de estudiantes menores de 18 años. Para estudiantes menores de 18 años, tratamos los datos de evaluación solo con la autorización de su madre, padre o tutor legal (consulta [Consentimiento Parental](/parental-consent)). Nunca estás obligado u obligada a responder una pregunta de evaluación que no quieras responder, pero algunos resultados no se pueden generar sin respuestas completas.",
        },
      ],
    },
    {
      id: "purposes",
      title: "4. Para qué usamos tus datos (finalidades y bases legales)",
      blocks: [
        {
          type: "table",
          head: ["Finalidad", "Base legal"],
          rows: [
            ["Crear y mantener tu cuenta; ofrecer evaluaciones, resultados, informes y herramientas de planificación", "Ejecución de nuestro contrato contigo; para datos sensibles y datos de menores, la autorización expresa del estudiante o de su madre, padre o tutor"],
            ["Calificar las evaluaciones con nuestro socio de metodología", "Contrato y autorización expresa"],
            ["Generar sugerencias e informes asistidos por IA", "Contrato y autorización expresa"],
            ["Procesar pagos, prevenir fraudes y llevar registros contables y tributarios", "Contrato y obligación legal"],
            ["Enviar correos del servicio (cuenta, seguridad, facturación, resultados listos)", "Contrato e interés legítimo"],
            ["Enviar consejos y novedades del producto", "Tu consentimiento (opcional); puedes retirarlo en cualquier momento"],
            ["Mejorar FormMaps con analítica de uso", "Tu consentimiento (opcional, a través del aviso de cookies)"],
            ["Mantener FormMaps seguro, corregir errores, cumplir la ley y responder a las autoridades", "Interés legítimo y obligación legal"],
          ],
        },
      ],
    },
    {
      id: "minors",
      title: "5. Niños, niñas y adolescentes",
      blocks: [
        {
          type: "ul",
          items: [
            "**De 13 a 17 años:** los estudiantes pueden registrarse por su cuenta solo con el permiso de su madre, padre o tutor legal, que ellos (o la madre, padre o tutor) confirman al registrarse. En muchos casos, la madre, padre o tutor crea la cuenta o la paga.",
            "**Colombia:** para los datos de menores y los datos sensibles obtenemos la autorización previa, expresa e informada de la madre, padre o representante legal, como lo exigen la Ley 1581 de 2012 y el Decreto 1377 de 2013 (hoy compilado en el Decreto 1074 de 2015), y respetamos el interés superior de niños, niñas y adolescentes y sus derechos fundamentales.",
            "**Costa Rica:** tratamos los datos de menores con el consentimiento de su representante legal, como lo exige la Ley 8968.",
            "**Estados Unidos (COPPA):** no recopilamos a sabiendas información personal de menores de 13 años, salvo a través de programas autorizados por colegios, en los que el colegio da el consentimiento en nombre de la madre o el padre con fines educativos. El registro por cuenta propia está bloqueado para menores de 13 años.",
            "**Si nos enteramos** de que recopilamos datos de un menor de 13 años sin el consentimiento requerido, o de un estudiante de 13 a 17 años sin el permiso de su madre, padre o tutor, suspenderemos la cuenta y eliminaremos los datos (u obtendremos el consentimiento requerido) sin demoras injustificadas. Si crees que esto pasó, escribe a " +
              privacy +
              ".",
          ],
        },
      ],
    },
    {
      id: "ai",
      title: "6. Cómo usamos la IA",
      blocks: [
        {
          type: "p",
          text: "Algunas funciones (por ejemplo, sugerencias de carrera, textos de los informes y ayuda con la hoja de vida) usan inteligencia artificial. Usamos **modelos Claude de Anthropic a través de Amazon Web Services (AWS Bedrock)**. Los datos que se envían se limitan a lo que la función necesita. Según los términos de nuestros proveedores, **tus datos no se usan para entrenar modelos de IA de terceros**.",
        },
        {
          type: "p",
          text: "Las sugerencias de la IA son solo orientación. **No** tomamos decisiones basadas únicamente en tratamientos automatizados que tengan efectos legales o efectos igual de importantes para ti; tus resultados y sugerencias son información para que tú, tu familia y tu colegio los tengan en cuenta.",
        },
      ],
    },
    {
      id: "sharing",
      title: "7. Con quién compartimos datos",
      blocks: [
        {
          type: "p",
          text: "Solo compartimos datos personales con proveedores de servicios que los tratan en nuestro nombre bajo contratos que exigen confidencialidad y seguridad (encargados del tratamiento), con tu colegio cuando usas FormMaps a través de uno, y con las autoridades cuando la ley lo exige. Nuestros principales proveedores son:",
        },
        {
          type: "table",
          head: ["Proveedor", "Qué hace", "Dónde se tratan los datos"],
          rows: [
            ["Amazon Web Services (AWS)", "Alojamiento, base de datos y almacenamiento de archivos, envío de correos (Amazon SES), procesamiento de IA (Amazon Bedrock)", "Estados Unidos"],
            ["Vercel", "Alojamiento web y entrega de contenido del sitio de FormMaps", "Estados Unidos"],
            ["Stripe", "Procesamiento de pagos y portal de facturación", "Estados Unidos"],
            [`${E.methodologyPartner}`, "Calificación de evaluaciones (PCA e instrumentos relacionados) dentro de nuestra alianza de metodología", `Escríbenos a ${C.privacyEmail} para conocer las ubicaciones de tratamiento actuales`],
            ["Sentry", "Monitoreo de errores (los datos personales se eliminan antes de enviar los reportes)", "Estados Unidos"],
            ["Daily.co", "Sesiones de video con orientadores o coaches, cuando se ofrecen", "Estados Unidos"],
          ],
        },
        {
          type: "p",
          text: "La analítica de uso es propia: si la aceptas, los eventos de uso se envían solo a los servidores de FormMaps (alojados en AWS); ningún proveedor externo de analítica o publicidad los recibe.",
        },
      ],
    },
    {
      id: "no-sale",
      title: "8. No vendemos tus datos",
      blocks: [
        {
          type: "p",
          text: "**No vendemos** datos personales, **no los compartimos** para publicidad dirigida o basada en tu comportamiento en otros sitios, y nunca vendemos ni alquilamos datos de menores.",
        },
      ],
    },
    {
      id: "transfers",
      title: "9. Transferencias internacionales",
      blocks: [
        {
          type: "p",
          text: "FormMaps se opera desde Estados Unidos y nuestros principales proveedores tratan los datos allí. Si vives en Costa Rica, Colombia u otro país, tus datos se transfieren a Estados Unidos. Lo hacemos con base en tu consentimiento o autorización expresa (o la de tu madre, padre o tutor) —como lo prevén el artículo 14 de la Ley 8968 de Costa Rica y el artículo 26 de la Ley 1581 de Colombia— y con garantías contractuales con nuestros proveedores que les exigen proteger tus datos.",
        },
      ],
    },
    {
      id: "retention",
      title: "10. Cuánto tiempo guardamos los datos",
      blocks: [
        {
          type: "ul",
          items: [
            "**Datos de cuenta, evaluaciones e informes:** mientras tu cuenta esté activa. Si una cuenta lleva 3 años inactiva, podemos eliminarla después de avisarte.",
            "**Cuando eliminas tu cuenta:** eliminamos o anonimizamos tus datos personales dentro de los 30 días, salvo lo que la ley nos obliga a conservar.",
            "**Registros de pagos e impuestos:** se conservan durante el plazo que exigen las leyes tributarias y contables (en general, hasta 7 años).",
            "**Copias de seguridad:** los datos eliminados desaparecen de nuestras copias de seguridad a medida que estas se renuevan, normalmente dentro de 35 días.",
            "**Registros de seguridad:** se conservan por un tiempo limitado, normalmente no más de 12 meses.",
          ],
        },
      ],
    },
    {
      id: "rights",
      title: "11. Tus derechos",
      blocks: [
        {
          type: "p",
          text: "Según dónde vivas, tú (o tu madre, padre o tutor, si eres menor de 18 años) tienes derecho a:",
        },
        {
          type: "ul",
          items: [
            "**Acceder** a tus datos y saber cómo se usan;",
            "**Rectificar** (corregir) datos inexactos o incompletos;",
            "**Eliminar** tus datos (cancelación o supresión), salvo que la ley nos obligue a conservarlos;",
            "**Portabilidad:** recibir una copia de tus datos en un formato común;",
            "**Oponerte** a ciertos usos y **revocar** tu consentimiento o autorización en cualquier momento (esto no afecta el tratamiento ya realizado);",
            "**Presentar una queja** ante la autoridad de protección de datos.",
          ],
        },
        {
          type: "p",
          text: "**Costa Rica (Ley 8968 y su reglamento):** tienes los derechos de acceso, rectificación y supresión, y puedes presentar una denuncia ante la **Agencia de Protección de Datos de los Habitantes (PRODHAB)**.",
        },
        {
          type: "p",
          text: "**Colombia (Ley 1581 de 2012 y Decreto 1377 de 2013):** puedes conocer, actualizar, rectificar y suprimir tus datos, solicitar prueba de tu autorización, ser informado sobre el uso de tus datos, revocar la autorización y presentar una queja ante la **Superintendencia de Industria y Comercio (SIC)** después de haberte comunicado primero con nosotros.",
        },
        {
          type: "p",
          text: "**Estados Unidos:** las madres y padres de niños cuyos datos tenemos según COPPA pueden revisar los datos de su hijo o hija, pedirnos que los eliminemos y negarse a que sigamos recopilándolos o usándolos. Los residentes de California y de otros estados con leyes de privacidad pueden pedir saber, acceder, corregir y eliminar sus datos personales, y no serán discriminados por ejercer estos derechos. No vendemos ni compartimos datos personales para publicidad dirigida, así que no hay nada de lo que debas excluirte.",
        },
      ],
    },
    {
      id: "exercise-rights",
      title: "12. Cómo ejercer tus derechos",
      blocks: [
        {
          type: "p",
          text: `Escribe a ${privacy} desde el correo electrónico de tu cuenta (o dinos cómo podemos verificar quién eres). Indica qué estás pidiendo. Si una madre, padre o tutor actúa en nombre de un estudiante, debe decirlo; podemos pedir una prueba razonable.`,
        },
        {
          type: "p",
          text: "Respondemos dentro de los plazos que exige la ley aplicable y buscamos resolver cada solicitud en un máximo de 15 días hábiles. En Colombia, las consultas se responden en un máximo de 10 días hábiles y los reclamos en un máximo de 15 días hábiles, según los artículos 14 y 15 de la Ley 1581; si necesitamos más tiempo, te diremos por qué, dentro de las prórrogas que permite la ley. Ejercer tus derechos es gratis.",
        },
      ],
    },
    {
      id: "delete-account",
      title: "13. Cómo eliminar tu cuenta",
      blocks: [
        {
          type: "p",
          text: `Escribe a ${privacy} desde el correo electrónico de tu cuenta con el asunto "Eliminar mi cuenta". Si tienes un plan mensual, cancélalo primero en **Panel → Suscripciones → Administrar facturación** para que no se te vuelva a cobrar. Te confirmamos la eliminación por correo electrónico. Si tu cuenta pertenece a un programa de un colegio, coordinamos la eliminación con tu colegio.`,
        },
      ],
    },
    {
      id: "security",
      title: "14. Seguridad",
      blocks: [
        {
          type: "p",
          text: "Usamos medidas técnicas y organizativas para proteger tus datos, como cifrado en tránsito (HTTPS) y en reposo, cookies de sesión seguras, contraseñas guardadas como hash, acceso limitado a las personas que lo necesitan, eliminación de datos personales de los reportes de errores, monitoreo y revisiones periódicas. Ningún sistema es 100 % seguro, así que por favor protege también tu contraseña.",
        },
      ],
    },
    {
      id: "breach",
      title: "15. Si ocurre un incidente de seguridad",
      blocks: [
        {
          type: "p",
          text: "Si un incidente de seguridad afecta tus datos personales, actuaremos para contenerlo y te notificaremos a ti y a las autoridades competentes como lo exija la ley aplicable (por ejemplo, la PRODHAB en Costa Rica o la SIC en Colombia) y sin demoras injustificadas.",
        },
      ],
    },
    {
      id: "cookies",
      title: "16. Cookies",
      blocks: [
        {
          type: "p",
          text: "Usamos cookies estrictamente necesarias y almacenamiento local para mantener tu sesión iniciada y recordar tus preferencias, y analítica solo si la aceptas. Los detalles están en nuestro [Aviso de Cookies](/cookies).",
        },
      ],
    },
    {
      id: "changes",
      title: "17. Cambios a esta política",
      blocks: [
        {
          type: "p",
          text: "Publicaremos cualquier actualización aquí con una nueva fecha. Si un cambio es importante —por ejemplo, una nueva finalidad para usar datos sensibles— te avisaremos con anticipación y, cuando la ley lo exija, volveremos a pedir tu consentimiento (o el de tu madre, padre o tutor).",
        },
      ],
    },
    {
      id: "contact",
      title: "18. Contacto",
      blocks: [
        {
          type: "p",
          text: `${E.name} — ${E.product}. Solicitudes sobre privacidad y protección de datos: ${privacy}.`,
        },
      ],
    },
  ],
};
