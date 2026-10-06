import type { LegalDocumentContent } from "../../types";
import { LEGAL_CONTACT as C, LEGAL_ENTITY as E } from "../../company";

const privacy = `[${C.privacyEmail}](mailto:${C.privacyEmail})`;

export const parentalConsentEs: LegalDocumentContent = {
  key: "parental-consent",
  locale: "es",
  title: "Consentimiento Parental",
  summary:
    "Los estudiantes de 13 a 17 años necesitan el permiso de su madre, padre o tutor legal para usar FormMaps. Esta página explica exactamente qué autorizas cuando das ese permiso y cómo puedes retirarlo.",
  sections: [
    {
      id: "who",
      title: "1. Quién da este consentimiento",
      blocks: [
        {
          type: "p",
          text: `Este consentimiento se otorga a **${E.name}**, que opera ${E.product}, por parte de la madre, padre o tutor legal de un estudiante de 13 a 17 años, ya sea directamente (cuando la madre, padre o tutor se registra o paga) o a través del estudiante, que confirma al registrarse que tiene el permiso de su madre, padre o tutor. Los estudiantes menores de 13 años solo pueden unirse a través de un colegio, que obtiene el consentimiento por separado.`,
        },
      ],
    },
    {
      id: "what-you-authorize",
      title: "2. Qué autorizas",
      blocks: [
        { type: "p", text: "Al dar tu consentimiento, autorizas a FormMaps a:" },
        {
          type: "ul",
          items: [
            "crear y mantener una cuenta de FormMaps para tu hijo o hija;",
            "recopilar y tratar los datos personales de tu hijo o hija como se describe en la [Política de Privacidad](/privacy), **incluidos datos sensibles: las respuestas y los resultados de evaluaciones psicométricas** (PCA/DISC, LIA cognitivo, Personalidad y Vocacional 360, incluidas las evaluaciones de madres, padres o profesores que tú o tu hijo o hija inviten);",
            "usar IA (modelos Claude de Anthropic a través de AWS Bedrock) para generar orientación e informes a partir de esos datos, que no se usan para entrenar modelos de terceros;",
            `compartir los datos de las evaluaciones con nuestro socio de metodología **${E.methodologyPartner}** para que pueda calificarlas;`,
            "compartir los datos de tu hijo o hija con su colegio, orientadores y profesores si su cuenta está vinculada a un colegio;",
            "**transferir los datos a Estados Unidos**, donde FormMaps y sus proveedores los tratan, con garantías contractuales.",
          ],
        },
      ],
    },
    {
      id: "payment",
      title: "3. Quién paga",
      blocks: [
        {
          type: "p",
          text: "Si pagas un plan para tu hijo o hija, tú eres el cliente de ese pago y aceptas los [Términos del Servicio](/terms) (incluidas las Condiciones de pago) y la [Política de Reembolsos y Cancelación](/refunds). Los planes mensuales se renuevan automáticamente hasta que se cancelan.",
        },
      ],
    },
    {
      id: "rights",
      title: "4. Tus derechos como madre, padre o tutor",
      blocks: [
        {
          type: "p",
          text: "Puedes, en cualquier momento y sin costo: ver los datos que tenemos sobre tu hijo o hija, corregirlos, pedirnos que los eliminemos, recibir una copia y negarte a que sigamos recopilándolos o usándolos. También puedes presentar una queja ante la autoridad de protección de datos (la PRODHAB en Costa Rica, la SIC en Colombia). Consulta la [Política de Privacidad](/privacy) para más detalles.",
        },
      ],
    },
    {
      id: "withdraw",
      title: "5. Retirar el consentimiento",
      blocks: [
        {
          type: "p",
          text: `Puedes retirar este consentimiento en cualquier momento escribiendo a ${privacy}. Cuando lo hagas, dejaremos de tratar los datos de tu hijo o hija para los servicios de FormMaps, cerraremos la cuenta y eliminaremos los datos, salvo lo que la ley nos obliga a conservar (como los registros de pagos). Retirar el consentimiento no afecta el tratamiento ya realizado. Si hay una suscripción activa, cancélala (o pídenos que lo hagamos) para que no se vuelva a cobrar; los reembolsos se rigen por la [Política de Reembolsos y Cancelación](/refunds).`,
        },
      ],
    },
    {
      id: "verification",
      title: "6. Verificación",
      blocks: [
        {
          type: "p",
          text: "Podemos tomar medidas razonables para confirmar que la persona que da el consentimiento es la madre, padre o tutor legal del estudiante; por ejemplo, pedir una confirmación por correo electrónico o, cuando se realiza un pago, basarnos en el pago hecho por la madre, padre o tutor. Si no podemos confirmar el consentimiento cuando se requiere, podemos limitar o cerrar la cuenta.",
        },
      ],
    },
    {
      id: "contact",
      title: "7. Contacto",
      blocks: [{ type: "p", text: `${E.name} — ${E.product}. Preguntas sobre el consentimiento o los datos de tu hijo o hija: ${privacy}.` }],
    },
  ],
};
