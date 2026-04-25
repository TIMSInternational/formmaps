import React from "react";

// Import all template components
import { ClassicTemplatePDF } from "./templates/ClassicTemplate";
import { ModernTemplatePDF } from "./templates/ModernTemplate";
import { CreativeTemplatePDF } from "./templates/CreativeTemplate";
import { MinimalTemplatePDF } from "./templates/MinimalTemplate";
import { ExecutiveTemplatePDF } from "./templates/ExecutiveTemplate";
import { TechTemplatePDF } from "./templates/TechTemplate";

/**
 * Creates a PDF document using the appropriate template component.
 * This ensures consistency between live preview and PDF download.
 */
export function createPDFDocument(data: any) {
  const { template } = data;

  // Use the same template components as LivePreviewPDF for consistency
  switch (template) {
    case "classic":
      return <ClassicTemplatePDF data={data} />;
    case "modern":
      return <ModernTemplatePDF data={data} />;
    case "creative":
      return <CreativeTemplatePDF data={data} />;
    case "minimal":
      return <MinimalTemplatePDF data={data} />;
    case "executive":
      return <ExecutiveTemplatePDF data={data} />;
    case "tech":
      return <TechTemplatePDF data={data} />;
    default:
      // Default to Classic template
      return <ClassicTemplatePDF data={data} />;
  }
}
