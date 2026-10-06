import type { LegalDocumentContent } from "../../types";
import { LEGAL_CONTACT as C, LEGAL_ENTITY as E, LEGAL_PRICES as P } from "../../company";

const legal = `[${C.legalEmail}](mailto:${C.legalEmail})`;

export const termsEs: LegalDocumentContent = {
  key: "terms",
  locale: "es",
  title: "Términos del Servicio",
  summary:
    "Estos Términos son el acuerdo entre tú y FormMaps. En resumen: debes tener 13 años o más (y el permiso de tu madre, padre o tutor si eres menor de 18), hacer las evaluaciones con honestidad y usar tus resultados como orientación, no como una garantía. Los planes pagos se renuevan cada mes hasta que los canceles, y puedes cancelar cuando quieras.",
  sections: [
    {
      id: "who-we-are",
      title: "1. Quiénes somos",
      blocks: [
        {
          type: "p",
          text: `${E.product} es operado por **${E.name}**, ${E.descriptionEs} ("FormMaps", "nosotros"). FormMaps ayuda a estudiantes a explorar carreras y planificar sus estudios mediante evaluaciones, resultados, informes y sugerencias asistidas por inteligencia artificial (IA).`,
        },
        {
          type: "p",
          text: `Nuestro socio de metodología y contenido de evaluación es **${E.methodologyPartner}** (${E.methodologyPartnerSite}), que califica algunas de las evaluaciones que haces en FormMaps.`,
        },
        {
          type: "p",
          text: "Al crear una cuenta, comprar un plan o usar FormMaps, aceptas estos Términos, nuestra [Política de Privacidad](/privacy) y, si pagas, nuestra [Política de Reembolsos y Cancelación](/refunds). Si no estás de acuerdo, por favor no uses FormMaps.",
        },
      ],
    },
    {
      id: "eligibility",
      title: "2. Quién puede usar FormMaps",
      blocks: [
        {
          type: "ul",
          items: [
            "**13 años o más:** puedes crear tu propia cuenta.",
            "**De 13 a 17 años:** necesitas el permiso de tu madre, padre o tutor legal. Muchas veces tu madre, padre o tutor creará la cuenta o la pagará contigo. Al registrarte, tú (o tu madre, padre o tutor) debe confirmar este permiso. Consulta nuestra [Declaración de Consentimiento Parental](/parental-consent).",
            "**Menores de 13 años:** solo puedes usar FormMaps a través de un colegio o institución que haya obtenido de tu madre, padre o tutor el consentimiento que exige la ley. El registro por cuenta propia no está disponible para menores de 13 años.",
          ],
        },
        {
          type: "p",
          text: "Si registras o pagas en nombre de una persona menor de edad, confirmas que eres su madre, padre o tutor legal y aceptas estos Términos en su nombre y en el tuyo.",
        },
      ],
    },
    {
      id: "accounts",
      title: "3. Tu cuenta",
      blocks: [
        {
          type: "ul",
          items: [
            "Da información correcta, incluida tu fecha de nacimiento real, y mantenla actualizada.",
            "Mantén tu contraseña en secreto. Eres responsable de lo que pase en tu cuenta. Avísanos de inmediato a " +
              legal +
              " si crees que otra persona la usó.",
            "Una persona por cuenta. No compartas, vendas ni transfieras tu cuenta.",
            "Si tu cuenta fue creada por un colegio, el colegio también puede administrar partes de ella (por ejemplo, vincularte a clases u orientadores).",
          ],
        },
      ],
    },
    {
      id: "acceptable-use",
      title: "4. Uso aceptable",
      blocks: [
        { type: "p", text: "Cuando usas FormMaps no debes:" },
        {
          type: "ul",
          items: [
            "violar la ley ni ayudar a otra persona a violarla;",
            "acosar, intimidar, amenazar o dañar a nadie, ni subir contenido de odio, sexual o violento;",
            "subir contenido que no tienes derecho a compartir, ni datos personales de otras personas sin su permiso;",
            "intentar entrar a cuentas, datos o sistemas que no son tuyos, probar nuestra seguridad sin permiso por escrito, ni interferir con el funcionamiento de FormMaps (incluso con bots, scrapers o solicitudes excesivas);",
            "copiar, revender, aplicar ingeniería inversa o crear un producto competidor a partir de FormMaps, sus evaluaciones o sus informes.",
          ],
        },
      ],
    },
    {
      id: "assessment-integrity",
      title: "5. Hacer las evaluaciones con honestidad",
      blocks: [
        {
          type: "p",
          text: "Tus resultados solo sirven si de verdad te reflejan. Por eso debes hacer las evaluaciones tú mismo o tú misma, sin que otra persona responda por ti, sin hacerte pasar por otra persona y sin copiar, grabar, compartir o publicar las preguntas o las claves de respuesta.",
        },
        {
          type: "p",
          text: "Algunas evaluaciones usan controles de integridad (por ejemplo, detectar cuando sales de la ventana de la evaluación). Podemos anular resultados, pedirte que repitas una evaluación o suspender una cuenta si creemos razonablemente que una evaluación no se hizo con honestidad.",
        },
      ],
    },
    {
      id: "ip",
      title: "6. Nuestro contenido y tu licencia",
      blocks: [
        {
          type: "p",
          text: `FormMaps, su software, diseño, evaluaciones, preguntas, métodos de calificación, informes y demás contenido pertenecen a ${E.name}, a ${E.methodologyPartner} o a nuestros licenciantes, y están protegidos por las leyes de propiedad intelectual.`,
        },
        {
          type: "p",
          text: "Te damos una licencia personal, limitada, no exclusiva, intransferible y revocable para usar FormMaps en tu propia educación y planificación de carrera mientras tu cuenta esté activa. Puedes descargar y guardar tus propios informes para uso personal y compartirlos con las personas que te ayudan (como tu familia, tu colegio o tu orientador). No puedes usarlos con fines comerciales.",
        },
      ],
    },
    {
      id: "user-content",
      title: "7. Tu contenido",
      blocks: [
        {
          type: "p",
          text: "Lo que subes o escribes en FormMaps es tuyo (por ejemplo, hojas de vida, ensayos, metas y mensajes). Nos das permiso para guardar, procesar y mostrar ese contenido solo en la medida necesaria para que FormMaps funcione para ti, como se explica en nuestra [Política de Privacidad](/privacy). Eres responsable de asegurarte de que tienes derecho a subirlo.",
        },
      ],
    },
    {
      id: "payment",
      title: "8. Condiciones de pago",
      blocks: [
        {
          type: "p",
          text: `**Precios y moneda.** Los precios se muestran y se cobran en dólares estadounidenses (${P.currency}). Planes actuales: Starter ${P.starterMonthly}/mes, Pro ${P.proMonthly}/mes, Premium ${P.premiumMonthly}/mes y una Compra única de ${P.oneTime}. El precio que aplica es el que se muestra al pagar.`,
        },
        {
          type: "p",
          text: `**Quién te cobra.** Los pagos los procesa Stripe. El comercio es **${E.name}**, y ese es el nombre que verás en el estado de cuenta de tu tarjeta. Nunca vemos ni guardamos el número completo de tu tarjeta.`,
        },
        {
          type: "p",
          text: "**Renovación automática.** Los planes mensuales (Starter, Pro y Premium) son suscripciones. **Se renuevan automáticamente cada mes y se cobra a tu medio de pago el precio mensual vigente en ese momento hasta que canceles.** Te avisaremos con anticipación antes de que un cambio de precio se aplique a tu suscripción, y puedes cancelar antes de que eso pase.",
        },
        {
          type: "p",
          text: `**Prueba gratuita.** Los planes mensuales pueden empezar con una prueba gratuita de ${P.trialDays} días. Se necesita una tarjeta válida para iniciar la prueba. **Si no cancelas antes de que termine la prueba, esta se convierte automáticamente en una suscripción mensual paga y se cobra a tu tarjeta el precio mensual vigente en ese momento, y así cada mes hasta que canceles.** Durante la prueba (y siempre que un plan no esté pagado) puedes hacer evaluaciones, pero solo ves una vista previa de tus resultados; los resultados completos se desbloquean cuando se realiza el pago.`,
        },
        {
          type: "p",
          text: "**Cómo cancelar.** Puedes cancelar en cualquier momento desde tu cuenta: **Panel → Suscripciones → Administrar facturación** (esto abre el portal de facturación seguro de Stripe), o escribiendo a " +
            legal +
            ". Al cancelar se detienen todos los cobros futuros. Mantienes el acceso hasta el final del período que ya pagaste; no reembolsamos meses parciales, salvo en los casos descritos en la [Política de Reembolsos y Cancelación](/refunds).",
        },
        {
          type: "p",
          text: `**Compra única (${P.oneTime}).** Un pago único te permite hacer las evaluaciones incluidas, ver tus resultados completos y descargar tus informes. No se renueva y no incluye funciones de suscripción como el acompañamiento (coaching). Tus resultados siguen disponibles en tu cuenta después de la compra.`,
        },
        {
          type: "p",
          text: "**Impuestos y cargos.** Los precios no incluyen impuestos. Los impuestos que apliquen en tu país —por ejemplo, el IVA de Costa Rica sobre servicios digitales transfronterizos, u otros impuestos locales sobre ventas o servicios digitales— pueden sumarse al pagar o ser cobrados por el emisor de tu tarjeta. Tu banco o el emisor de tu tarjeta también puede cobrar cargos por conversión de moneda o por transacciones en el extranjero; esos cargos los fija tu banco, no nosotros.",
        },
        {
          type: "p",
          text: "**Pagos fallidos.** Si falla el pago de una renovación, podemos intentarlo de nuevo y podemos pausar las funciones pagas hasta que el pago se complete.",
        },
      ],
    },
    {
      id: "refunds",
      title: "9. Reembolsos",
      blocks: [
        {
          type: "p",
          text: "Los reembolsos, las cancelaciones de la prueba y las disputas de pago se rigen por nuestra [Política de Reembolsos y Cancelación](/refunds), que forma parte de estos Términos.",
        },
      ],
    },
    {
      id: "guidance-only",
      title: "10. Solo orientación — por favor lee esto",
      blocks: [
        {
          type: "p",
          text: "FormMaps te da **orientación**. Las evaluaciones, resultados, informes, coincidencias de carrera y sugerencias generadas por IA son herramientas informativas para ayudarte a pensar en tus opciones. Estas herramientas:",
        },
        {
          type: "ul",
          items: [
            "**no** garantizan la admisión a ningún colegio o universidad, ningún empleo, ningún resultado académico ni ningún resultado profesional;",
            "**no** son un diagnóstico ni una evaluación clínica, médica o psicológica;",
            "**no** reemplazan el consejo de profesionales calificados, como psicólogos, médicos, orientadores escolares o asesores de admisión.",
          ],
        },
        {
          type: "p",
          text: "El contenido generado por IA puede estar incompleto o tener errores. Verifica siempre la información importante (como requisitos de admisión, fechas límite y costos) con la fuente oficial, y toma las decisiones importantes junto con tu familia y los profesionales que te conocen.",
        },
      ],
    },
    {
      id: "warranty",
      title: "11. Exclusión de garantías",
      blocks: [
        {
          type: "p",
          text: "Trabajamos duro para que FormMaps sea preciso, esté disponible y sea seguro, pero en la medida en que la ley lo permita, FormMaps se ofrece \"tal cual\" y \"según disponibilidad\", sin garantías de ningún tipo, expresas o implícitas, incluidas la idoneidad para un fin determinado, la exactitud y la disponibilidad ininterrumpida.",
        },
      ],
    },
    {
      id: "liability",
      title: "12. Limitación de responsabilidad",
      blocks: [
        {
          type: "p",
          text: `En la medida en que la ley lo permita, ${E.name} y sus socios no son responsables por daños indirectos, incidentales, especiales o consecuentes, ni por decisiones que tomes con base en la orientación de FormMaps. Nuestra responsabilidad total por cualquier reclamo relacionado con FormMaps se limita al monto que nos pagaste en los 12 meses anteriores al reclamo.`,
        },
      ],
    },
    {
      id: "consumer-rights",
      title: "13. Tus derechos como consumidor",
      blocks: [
        {
          type: "p",
          text: "**Nada en estos Términos limita ni excluye los derechos que tienes según las leyes de protección al consumidor y que no se pueden renunciar por contrato**, incluidos, cuando apliquen, los derechos de la Ley 7472 de Costa Rica (Ley de Promoción de la Competencia y Defensa Efectiva del Consumidor) y de la Ley 1480 de 2011 de Colombia (Estatuto del Consumidor). Si alguna parte de estos Términos contradice esos derechos, prevalecen esos derechos.",
        },
      ],
    },
    {
      id: "termination",
      title: "14. Suspensión y terminación",
      blocks: [
        {
          type: "ul",
          items: [
            "Puedes dejar de usar FormMaps y pedirnos que eliminemos tu cuenta en cualquier momento (consulta la [Política de Privacidad](/privacy)).",
            "Podemos suspender o cerrar una cuenta que incumpla estos Términos, que ponga en riesgo a otras personas o a FormMaps, o cuando la ley lo exija. Cuando sea razonable, te diremos por qué y te daremos la oportunidad de corregir el problema.",
            "Si abres una reversión del pago o una disputa de pago, el acceso pago se suspende mientras la disputa esté abierta, como se describe en la [Política de Reembolsos y Cancelación](/refunds).",
          ],
        },
      ],
    },
    {
      id: "changes",
      title: "15. Cambios a estos Términos",
      blocks: [
        {
          type: "p",
          text: "Podemos actualizar estos Términos. Cada versión tiene una fecha en la parte superior de esta página. Si hacemos un cambio importante, te avisaremos con anticipación (por ejemplo, por correo electrónico o en la app) y, cuando sea necesario, te pediremos que aceptes la nueva versión antes de seguir usando las funciones pagas. Si no estás de acuerdo, puedes cancelar antes de que el cambio entre en vigor.",
        },
      ],
    },
    {
      id: "governing-law",
      title: "16. Ley aplicable y disputas",
      blocks: [
        {
          type: "p",
          text: "Estos Términos se rigen por las leyes del Estado de Florida, Estados Unidos, sin tener en cuenta sus normas sobre conflicto de leyes. Esto no te quita la protección de las leyes obligatorias de protección al consumidor del país donde vives, y puedes presentar un reclamo ante los tribunales o las autoridades de consumo que esas leyes permitan. Antes de iniciar una disputa formal, por favor contáctanos: la mayoría de los problemas se pueden resolver rápido.",
        },
      ],
    },
    {
      id: "contact",
      title: "17. Contacto",
      blocks: [
        {
          type: "p",
          text: `${E.name} — ${E.product}. Preguntas sobre estos Términos: ${legal}. Preguntas sobre privacidad: [${C.privacyEmail}](mailto:${C.privacyEmail}).`,
        },
      ],
    },
  ],
};
