import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { TimelineEvent } from "@/types/timeline";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";

// Register fonts (optional, using default Helvetica for now)
// Font.register({ family: 'Roboto', src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-light-webfont.ttf' });

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 30,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
  },
  table: {
    display: "flex",
    width: "auto",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: {
    margin: "auto",
    flexDirection: "row",
  },
  tableColHeader: {
    width: "20%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderLeftWidth: 0,
    borderTopWidth: 0,
    backgroundColor: "#F9FAFB",
    padding: 5,
  },
  tableCol: {
    width: "20%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 5,
  },
  tableColWide: {
    width: "40%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 5,
  },
  tableCellHeader: {
    margin: "auto",
    fontSize: 10,
    fontWeight: "bold",
    color: "#374151",
  },
  tableCell: {
    margin: "auto",
    fontSize: 9,
    color: "#4B5563",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: "center",
    fontSize: 8,
    color: "#9CA3AF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 10,
  },
});

interface TimelinePDFDocumentProps {
  events: TimelineEvent[];
  language: "en" | "sp";
}

export function TimelinePDFDocument({
  events,
  language,
}: TimelinePDFDocumentProps) {
  const locale = language === "sp" ? es : enUS;
  const title =
    language === "sp" ? "Reporte de Línea de Tiempo" : "Timeline Report";
  const generatedOn =
    language === "sp" ? "Generado el" : "Generated on";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {generatedOn} {format(new Date(), "PPP", { locale })}
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View style={styles.tableColHeader}>
              <Text style={styles.tableCellHeader}>
                {language === "sp" ? "Fecha" : "Date"}
              </Text>
            </View>
            <View style={styles.tableColHeader}>
              <Text style={styles.tableCellHeader}>
                {language === "sp" ? "Tipo" : "Type"}
              </Text>
            </View>
            <View style={styles.tableColWide}>
              <Text style={styles.tableCellHeader}>
                {language === "sp" ? "Evento" : "Event"}
              </Text>
            </View>
            <View style={styles.tableColHeader}>
              <Text style={styles.tableCellHeader}>
                {language === "sp" ? "Estado" : "Status"}
              </Text>
            </View>
          </View>

          {events.map((event) => (
            <View style={styles.tableRow} key={event.id}>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>
                  {format(new Date(event.timestamp), "MMM d, yyyy", { locale })}
                </Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{event.type.toUpperCase()}</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>{event.title}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>
                  {event.status.replace("_", " ")}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
