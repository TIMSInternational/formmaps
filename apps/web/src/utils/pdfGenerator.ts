
/**
 * Generates a PDF from a React component by rendering it to a hidden container,
 * capturing it with html2canvas, and saving it with jsPDF.
 */
export const generateAssessmentPDF = async (
  reportComponent: React.ReactElement,
  fileName: string = 'Assessment-Report.pdf'
) => {
  // Dynamically import heavy dependencies
  const [jsPDFModule, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas')
  ]);
  const jsPDF = jsPDFModule.jsPDF;
  const html2canvas = html2canvasModule.default;

  // 1. Create a hidden container to render the report
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '210mm'; // A4 width
  // Ensure the container has the same classes/styles as the print page if needed
  // For Tailwind, we might need to wrap it in a provider if we used one, but here it seems standalone.

  // Override CSS variables to use HEX instead of OKLCH/LAB for html2canvas compatibility
  const style = document.createElement('style');
  style.innerHTML = `
    .pdf-container {
      --background: #ffffff;
      --foreground: #020817;
      --card: #ffffff;
      --card-foreground: #020817;
      --popover: #ffffff;
      --popover-foreground: #020817;
      --primary: #0f172a;
      --primary-foreground: #f8fafc;
      --secondary: #f1f5f9;
      --secondary-foreground: #0f172a;
      --muted: #f1f5f9;
      --muted-foreground: #64748b;
      --accent: #f1f5f9;
      --accent-foreground: #0f172a;
      --destructive: #ef4444;
      --destructive-foreground: #f8fafc;
      --border: #e2e8f0;
      --input: #e2e8f0;
      --ring: #020817;
      --radius: 0.5rem;
      background-color: #ffffff;
      color: #020817;
    }
    .pdf-container * {
      box-sizing: border-box;
    }
  `;
  container.appendChild(style);
  container.classList.add('pdf-container');

  document.body.appendChild(container);

  // We need to render the component into the container.
  // Since we are in a Next.js client component, we can use createRoot from react-dom/client
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(container);

  // Wrap in a promise to wait for rendering (and potentially images loading)
  await new Promise<void>((resolve) => {
    root.render(reportComponent);
    // Give it a moment to render. For images, we might need more robust loading checks.
    // simpler approach: wait a bit.
    setTimeout(resolve, 1000);
  });

  try {
    // 2. Capture the content
    // The report in page.tsx has multiple pages defined by dimensions. 
    // We should probably capture the whole container.
    // However, html2canvas on a long div might create one huge image.
    // If the report is designed with pages, we might want to capture each page separately if they are distinct elements,
    // or capture the whole thing and split it in PDF.

    // Looking at page.tsx, it has multiple divs with class "w-[210mm] h-[297mm]" (A4)
    // We can select those specific page elements.

    const pageElements = container.querySelectorAll('.sidebar-print-page, .w-\\[210mm\\]');
    // The selector .w-[210mm] might struggle with escaping. 
    // It's safer to rely on the fact they are children or just capture the container if they are stacked.
    // But page.tsx has `gap-8` on the parent. We should probably capture each "page" div separately.

    // Let's refine the selector or add a class to the pages in page.tsx if possible.
    // But without changing page.tsx too much, we can select children of the main div.
    // The main div in `NexaReport` (formerly NexaValuesPage) matches:
    // <div className="min-h-screen bg-gray-100 py-8 flex flex-col items-center gap-8 ...">
    //   <div ... page 1 ...>
    //   <div ... page 2 ...>
    // </div>

    // Find the NexaReport wrapper (skip our injected style tag)
    // The NexaReport renders as: <div className="min-h-screen ...">...</div>
    // We need to find this div, not the style tag we added
    const mainWrapper = Array.from(container.children).find(
      child => child.tagName !== 'STYLE'
    );

    // Get the page divs inside NexaReport, filtering out any style tags
    const pages = Array.from(mainWrapper?.children || []).filter(
      child => child.tagName !== 'STYLE'
    );

    const pdf = new jsPDF('p', 'mm', 'a4');

    // CRITICAL FIX: Patch the MAIN window's getComputedStyle before html2canvas
    // html2canvas uses the main window's getComputedStyle, not the cloned document's
    const originalGetComputedStyle = window.getComputedStyle.bind(window);

    // Helper to check if a value contains problematic color functions
    const hasProblematicColor = (value: string | null | undefined): boolean => {
      if (!value || typeof value !== 'string') return false;
      return value.includes('lab(') || value.includes('oklch(') || value.includes('oklab(') || value.includes('color(');
    };

    // Helper to get a safe fallback color
    const getSafeColor = (prop: string): string => {
      if (prop.includes('background') || prop === 'fill') return 'transparent';
      if (prop === 'color') return '#020817';
      if (prop.includes('border') || prop.includes('outline')) return 'transparent';
      if (prop.includes('shadow')) return 'none';
      return 'transparent';
    };

    // Temporarily override getComputedStyle on the MAIN window
    (window as any).getComputedStyle = function (element: Element, pseudoElt?: string | null) {
      const originalStyles = originalGetComputedStyle(element, pseudoElt);

      // Return a Proxy that intercepts property access
      return new Proxy(originalStyles, {
        get(target: CSSStyleDeclaration, prop: string | symbol): any {
          const value = (target as any)[prop];

          // If it's a function, bind it to the original target
          if (typeof value === 'function') {
            return value.bind(target);
          }

          // If it's a string with problematic colors, return safe fallback
          if (typeof value === 'string' && hasProblematicColor(value)) {
            return getSafeColor(String(prop));
          }

          return value;
        }
      });
    };

    try {
      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement;
        // Skip style tags or other non-page elements if any
        if (pageEl.tagName === 'STYLE') continue;

        if (i > 0) {
          pdf.addPage();
        }

        const canvas = await html2canvas(pageEl, {
          scale: 2, // Better quality
          useCORS: true,
          logging: false,
          windowWidth: 794, // 210mm approx in px at 96dpi
          windowHeight: 1123, // 297mm approx
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 210;
        const pageHeight = 297;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      }

      pdf.save(fileName);
    } finally {
      // CRITICAL: Restore the original getComputedStyle
      (window as any).getComputedStyle = originalGetComputedStyle;
    }

  } catch (error) {
      // error handled silently
    } finally {
    // Cleanup
    root.unmount();
    document.body.removeChild(container);
  }
};
