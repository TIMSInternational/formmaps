import type { LegalDocumentContent } from "../../types";
import { LEGAL_CONTACT as C, LEGAL_ENTITY as E, LEGAL_PRICES as P } from "../../company";

const billing = `[${C.billingEmail}](mailto:${C.billingEmail})`;

export const refundsEs: LegalDocumentContent = {
  key: "refunds",
  locale: "es",
  title: "Política de Reembolsos y Cancelación",
  summary: `Si cancelas una prueba gratuita dentro de los ${P.trialDays} días, nunca se te cobra. Si cancelas un plan mensual en cualquier momento, mantienes el acceso hasta el final del mes que pagaste. Tu primer cobro mensual y la compra única de ${P.oneTime} se pueden reembolsar dentro de los ${P.refundWindowDays} días si todavía no has recibido tus resultados o informes completos.`,
  sections: [
    {
      id: "trial",
      title: `1. Prueba gratuita (${P.trialDays} días)`,
      blocks: [
        {
          type: "p",
          text: `Si cancelas en cualquier momento durante la prueba gratuita de ${P.trialDays} días, **nunca se te cobra**. Si no cancelas, la prueba se convierte en una suscripción mensual paga al terminar.`,
        },
      ],
    },
    {
      id: "monthly",
      title: "2. Planes mensuales (Starter, Pro, Premium)",
      blocks: [
        {
          type: "ul",
          items: [
            "Puedes cancelar en cualquier momento. Al cancelar se detienen todos los cobros futuros.",
            "Después de cancelar, **mantienes el acceso hasta el final del período que ya pagaste**.",
            "No hacemos reembolsos por meses parciales.",
            `**Garantía del primer cobro:** te reembolsamos el total de tu **primer** cobro mensual si lo pides dentro de los ${P.refundWindowDays} días siguientes a ese cobro **y** no se ha descargado ningún informe completo desde tu cuenta.`,
          ],
        },
      ],
    },
    {
      id: "one-time",
      title: `3. Compra única (${P.oneTime})`,
      blocks: [
        {
          type: "ul",
          items: [
            `**Reembolso total dentro de los ${P.refundWindowDays} días** siguientes a la compra si no se han desbloqueado ni visto resultados completos y no se ha descargado ningún informe.`,
            "**Una vez entregados tus resultados completos, la compra no es reembolsable.** Se trata de contenidos digitales entregados de inmediato con tu consentimiento expreso al pagar, momento en el que aceptaste que el plazo de reembolso termina cuando se entregan los resultados completos.",
            "**Excepciones:** siempre reembolsamos los cobros duplicados y los cobros en los que una falla técnica de nuestra parte impidió entregar los resultados o informes y no pudimos solucionarla en un tiempo razonable.",
          ],
        },
      ],
    },
    {
      id: "disputes",
      title: "4. Contracargos y disputas de pago",
      blocks: [
        {
          type: "p",
          text: `Por favor, escríbenos primero a ${billing}: normalmente resolvemos los problemas más rápido que una disputa con el banco. Si abres un contracargo o una disputa, **el acceso pago se suspende mientras la disputa esté abierta**. El acceso se restablece si la disputa se resuelve a favor del cobro; termina si el cobro se revierte.`,
        },
      ],
    },
    {
      id: "how-refunds-are-paid",
      title: "5. Cómo se pagan los reembolsos",
      blocks: [
        {
          type: "p",
          text: "Los reembolsos aprobados se devuelven al medio de pago original a través de Stripe. Normalmente aparecen en 5 a 10 días hábiles, según tu banco o el emisor de tu tarjeta. Los reembolsos se hacen en dólares estadounidenses; el monto que veas en tu moneda local puede variar por el tipo de cambio o por cargos que fija tu banco. Cuando se emite un reembolso, termina el acceso pago que cubría.",
        },
      ],
    },
    {
      id: "request",
      title: "6. Cómo pedir un reembolso",
      blocks: [
        {
          type: "p",
          text: `Escribe a ${billing} desde el correo electrónico de la cuenta e incluye: el correo de la cuenta, el nombre del estudiante, la fecha y el monto del cobro, el plan (mensual o compra única) y el motivo. Respondemos en un máximo de 5 días hábiles.`,
        },
      ],
    },
    {
      id: "cancel",
      title: "7. Cómo cancelar",
      blocks: [
        {
          type: "p",
          text: `En tu cuenta, ve a **Panel → Suscripciones → Administrar facturación** y cancela en el portal de facturación seguro de Stripe, o escribe a ${billing}. La compra única no se renueva, así que no hay nada que cancelar.`,
        },
      ],
    },
    {
      id: "statutory-rights",
      title: "8. Tus derechos legales",
      blocks: [
        {
          type: "p",
          text: "Esta política no limita ningún derecho que tengas según las leyes de protección al consumidor y que no se pueda renunciar, como, cuando aplique, el derecho de retracto y la reversión del pago de la Ley 1480 de 2011 de Colombia, o tus derechos según la Ley 7472 de Costa Rica. Cuando esas leyes te den más, se aplican esas leyes.",
        },
      ],
    },
    {
      id: "contact",
      title: "9. Contacto",
      blocks: [{ type: "p", text: `${E.name} — ${E.product}. Facturación y reembolsos: ${billing}.` }],
    },
  ],
};
