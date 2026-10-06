import jsPDF from "jspdf";
import { ScanResult, DetectedField, getOverallAssessment, getAssessmentSummary } from "./scan-context";
import { findingStatusLabel, rulebookStampText } from "./rule-findings";
import { CHECK_DISCLAIMER } from "./disclaimer";

const statusLabel = (status: DetectedField["status"]) => {
  switch (status) {
    case "verified": return "Verified";
    case "low_confidence": return "Low Confidence";
    case "not_verified": return "Not Verified";
    case "missing": return "Missing";
  }
};

const statusColor = (status: DetectedField["status"]): [number, number, number] => {
  switch (status) {
    case "verified": return [34, 139, 34];
    case "low_confidence": return [200, 150, 0];
    case "not_verified": return [110, 110, 110];
    case "missing": return [200, 50, 50];
  }
};

export const generateComplianceReport = (result: ScanResult) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  const addText = (text: string, x: number, yPos: number, opts?: { fontSize?: number; fontStyle?: string; color?: [number, number, number]; maxWidth?: number }) => {
    doc.setFontSize(opts?.fontSize ?? 11);
    doc.setFont("helvetica", opts?.fontStyle ?? "normal");
    if (opts?.color) doc.setTextColor(...opts.color);
    else doc.setTextColor(40, 40, 40);
    if (opts?.maxWidth) {
      doc.text(text, x, yPos, { maxWidth: opts.maxWidth });
    } else {
      doc.text(text, x, yPos);
    }
  };

  // Header
  doc.setFillColor(30, 64, 120);
  doc.rect(0, 0, pageWidth, 40, "F");
  addText("Label Compliance Report", 14, 18, { fontSize: 20, fontStyle: "bold", color: [255, 255, 255] });
  addText(`Generated: ${new Date().toLocaleDateString("en-GB")}`, 14, 28, { fontSize: 10, color: [200, 210, 230] });
  y = 50;

  // Product info
  addText("Product Information", 14, y, { fontSize: 14, fontStyle: "bold", color: [30, 64, 120] });
  y += 8;
  doc.setDrawColor(30, 64, 120);
  doc.line(14, y, pageWidth - 14, y);
  y += 8;

  addText(`File: ${result.fileName}`, 14, y);
  y += 7;
  addText(`Category: ${result.category}`, 14, y);
  y += 12;

  // Assessment Summary
  addText("Assessment Summary", 14, y, { fontSize: 14, fontStyle: "bold", color: [30, 64, 120] });
  y += 8;
  doc.line(14, y, pageWidth - 14, y);
  y += 8;
  const summaryLines = doc.splitTextToSize(getAssessmentSummary(result), pageWidth - 28);
  addText(summaryLines.join("\n"), 14, y, { fontSize: 10, maxWidth: pageWidth - 28 });
  y += summaryLines.length * 5 + 10;

  // Image Coverage Assessment
  if (y > 250) { doc.addPage(); y = 20; }
  addText("Image Coverage Assessment", 14, y, { fontSize: 14, fontStyle: "bold", color: [30, 64, 120] });
  y += 8;
  doc.line(14, y, pageWidth - 14, y);
  y += 8;
  const coverageLines = doc.splitTextToSize(result.coverage.note, pageWidth - 28);
  addText(coverageLines.join("\n"), 14, y, { fontSize: 10, maxWidth: pageWidth - 28 });
  y += coverageLines.length * 5 + 4;
  if (result.coverage.missingAreas.length > 0) {
    const notVisible = `Not visible: ${result.coverage.missingAreas.join(", ")}.`;
    const notVisibleLines = doc.splitTextToSize(notVisible, pageWidth - 28);
    addText(notVisibleLines.join("\n"), 14, y, { fontSize: 9, color: [120, 120, 120], maxWidth: pageWidth - 28 });
    y += notVisibleLines.length * 5 + 4;
  }
  y += 6;

  // Scoring — non-numeric headline when coverage is partial, matching the
  // in-app report's rule that a partial-coverage scan must never read as a
  // pass/fail score.
  if (y > 250) { doc.addPage(); y = 20; }
  const assessment = getOverallAssessment(result);
  const assessmentColor: [number, number, number] =
    assessment.tone === "good" ? [34, 139, 34] : assessment.tone === "attention" ? [200, 50, 50] : [200, 150, 0];
  addText(assessment.banner, 14, y, { fontSize: 14, fontStyle: "bold", color: assessmentColor });
  y += 7;
  addText(assessment.detail, 14, y, { fontSize: 10, color: [80, 80, 80] });
  y += 14;

  // Regulatory checks — deterministic rule results, legal first
  if (result.rulebook && result.findings.length > 0) {
    if (y > 250) { doc.addPage(); y = 20; }
    addText("Regulatory Checks", 14, y, { fontSize: 14, fontStyle: "bold", color: [30, 64, 120] });
    y += 8;
    doc.line(14, y, pageWidth - 14, y);
    y += 8;

    const findingColor = (status: string): [number, number, number] =>
      status === "fail" || status === "review" ? [200, 50, 50] : status === "not_verified" ? [200, 150, 0] : [34, 139, 34];

    for (const [severity, heading] of [["legal", "Legal requirements"], ["best_practice", "Best practice"]] as const) {
      const group = result.findings.filter((f) => f.severity === severity);
      if (group.length === 0) continue;
      if (y > 260) { doc.addPage(); y = 20; }
      addText(heading, 14, y, { fontSize: 11, fontStyle: "bold", color: [80, 80, 80] });
      y += 7;
      for (const f of group) {
        if (y > 255) { doc.addPage(); y = 20; }
        addText(`${f.title} — ${findingStatusLabel(f.status)}`, 14, y, { fontSize: 10, fontStyle: "bold", color: findingColor(f.status) });
        y += 5;
        const detail = [f.reason, f.status !== "pass" ? f.fix : null, f.sources.map((s) => `${s.market} ${s.clause}`).join("; ")]
          .filter(Boolean)
          .join("\n");
        const lines = doc.splitTextToSize(detail, pageWidth - 34);
        addText(lines.join("\n"), 20, y, { fontSize: 9, color: [80, 80, 80], maxWidth: pageWidth - 34 });
        y += lines.length * 4.5 + 4;
      }
    }
    y += 6;
  }

  // Detected fields
  if (y > 250) { doc.addPage(); y = 20; }
  addText("Detected Fields", 14, y, { fontSize: 14, fontStyle: "bold", color: [30, 64, 120] });
  y += 8;
  doc.line(14, y, pageWidth - 14, y);
  y += 8;

  const verifiedFields = result.fields.filter(f => f.status === "verified");
  for (const field of verifiedFields) {
    if (y > 270) { doc.addPage(); y = 20; }
    addText(`✓ ${field.label}`, 14, y, { fontStyle: "bold" });
    y += 6;
    if (field.value) {
      const lines = doc.splitTextToSize(field.value, pageWidth - 34);
      addText(lines.join("\n"), 20, y, { fontSize: 10, color: [80, 80, 80], maxWidth: pageWidth - 34 });
      y += lines.length * 5 + 4;
    }
  }

  // Issues
  const issueFields = result.fields.filter(f => f.status !== "verified");
  if (issueFields.length > 0) {
    y += 6;
    if (y > 250) { doc.addPage(); y = 20; }
    addText("Needs Attention", 14, y, { fontSize: 14, fontStyle: "bold", color: [200, 50, 50] });
    y += 8;
    doc.setDrawColor(200, 50, 50);
    doc.line(14, y, pageWidth - 14, y);
    doc.setDrawColor(30, 64, 120);
    y += 8;

    for (const field of issueFields) {
      if (y > 260) { doc.addPage(); y = 20; }
      const color = statusColor(field.status);
      addText(`${field.label}`, 14, y, { fontStyle: "bold", color });
      y += 6;
      addText(`Status: ${statusLabel(field.status)}`, 20, y, { fontSize: 10, color: [80, 80, 80] });
      y += 6;
      if (field.suggestedFix) {
        const fixLines = doc.splitTextToSize(field.suggestedFix, pageWidth - 34);
        addText(fixLines.join("\n"), 20, y, { fontSize: 10, color: [34, 100, 34], maxWidth: pageWidth - 34 });
        y += fixLines.length * 5 + 4;
      }
    }
  }

  // Disclaimer
  y += 10;
  if (y > 250) { doc.addPage(); y = 20; }
  const disclaimer = result.coverage.isComplete
    ? CHECK_DISCLAIMER
    : `This assessment is based only on the visible areas of the submitted packaging. Information identified as "Not Verified" may exist elsewhere on the product and should not be interpreted as missing without additional images. ${CHECK_DISCLAIMER}`;
  const stamp = result.rulebook ? ` ${rulebookStampText(result.rulebook, result.findings)}` : "";
  const disclaimerLines = doc.splitTextToSize(disclaimer + stamp, pageWidth - 36);
  doc.setFillColor(245, 245, 245);
  doc.rect(14, y - 4, pageWidth - 28, disclaimerLines.length * 4 + 8, "F");
  addText(disclaimerLines.join("\n"), 16, y + 4, { fontSize: 8, color: [120, 120, 120], maxWidth: pageWidth - 36 });

  doc.save(`Label-Review-${result.fileName.replace(/\.[^.]+$/, "")}.pdf`);
};
