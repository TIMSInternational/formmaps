import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 30,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    textAlign: "center",
  },
  event: {
    marginBottom: 15,
    padding: 10,
    borderBottom: "1 solid #cccccc",
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  eventDescription: {
    fontSize: 12,
    marginBottom: 5,
  },
  eventMeta: {
    fontSize: 10,
    color: "#666666",
  },
});

interface TimelinePDFProps {
  events: any[];
  language: "en" | "sp";
}

const TimelinePDF: React.FC<TimelinePDFProps> = ({ events, language }) => {
  const title =
    language === "sp" ? "Cronograma de Evaluaciones" : "Assessment Timeline";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        {events.map((event, index) => (
          <View key={index} style={styles.event}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.eventDescription}>{event.description}</Text>
            <Text style={styles.eventMeta}>
              {new Date(event.timestamp).toLocaleDateString()} -{" "}
              {event.type.toUpperCase()} - {event.status}
            </Text>
          </View>
        ))}
      </Page>
    </Document>
  );
};

export default TimelinePDF;
