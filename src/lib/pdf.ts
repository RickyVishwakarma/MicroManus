import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createAdminClient } from "./supabase/admin";

/**
 * Renders a markdown-lite report (#, ##, - bullets, paragraphs) to a PDF,
 * uploads it to the private `artifacts` bucket, and returns a 7-day signed
 * URL plus the storage path.
 */
export async function createPdfReport(opts: {
  userId: string;
  threadId: string;
  title: string;
  markdown: string;
}): Promise<{ url: string; path: string; name: string }> {
  const bytes = await renderPdf(opts.title, opts.markdown);

  const slug =
    opts.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "report";
  const name = `${slug}.pdf`;
  const path = `${opts.userId}/${opts.threadId}/${Date.now()}-${name}`;

  const admin = createAdminClient();
  const upload = await admin.storage
    .from("artifacts")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (upload.error) throw new Error(`PDF upload failed: ${upload.error.message}`);

  const signed = await admin.storage
    .from("artifacts")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signed.error || !signed.data)
    throw new Error("Could not create a download link for the PDF.");

  return { url: signed.data.signedUrl, path, name };
}

// ─── rendering ────────────────────────────────────────────────────────────────

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;

interface Block {
  type: "h1" | "h2" | "li" | "p" | "space";
  text: string;
}

async function renderPdf(title: string, markdown: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  const draw = (
    text: string,
    f: PDFFont,
    size: number,
    indent = 0,
    color = rgb(0.1, 0.1, 0.15)
  ) => {
    const lines = wrap(text, f, size, CONTENT_W - indent);
    for (const line of lines) {
      if (y < MARGIN + 24) newPage();
      page.drawText(line, { x: MARGIN + indent, y, size, font: f, color });
      y -= size * 1.45;
    }
  };

  // Title block
  draw(sanitize(title), bold, 22);
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1.5,
    color: rgb(0.43, 0.36, 0.96),
  });
  y -= 22;

  for (const block of parseMarkdown(markdown)) {
    switch (block.type) {
      case "h1":
        y -= 10;
        draw(block.text, bold, 16);
        y -= 2;
        break;
      case "h2":
        y -= 6;
        draw(block.text, bold, 13);
        break;
      case "li":
        if (y < MARGIN + 24) newPage();
        page.drawText("•", {
          x: MARGIN + 4,
          y,
          size: 11,
          font,
          color: rgb(0.43, 0.36, 0.96),
        });
        draw(block.text, font, 11, 16);
        y -= 2;
        break;
      case "p":
        draw(block.text, font, 11);
        y -= 6;
        break;
      case "space":
        y -= 8;
        break;
    }
  }

  // Footer page numbers
  const pages = doc.getPages();
  pages.forEach((p: PDFPage, i: number) => {
    p.drawText(`MicroManus  ·  page ${i + 1} of ${pages.length}`, {
      x: MARGIN,
      y: 30,
      size: 8,
      font,
      color: rgb(0.55, 0.57, 0.65),
    });
  });

  return doc.save();
}

function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blocks.push({ type: "space", text: "" });
    } else if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: clean(line.slice(3)) });
    } else if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: clean(line.slice(2)) });
    } else if (/^\s*[-*]\s+/.test(line)) {
      blocks.push({ type: "li", text: clean(line.replace(/^\s*[-*]\s+/, "")) });
    } else if (line.startsWith("### ")) {
      blocks.push({ type: "h2", text: clean(line.slice(4)) });
    } else {
      blocks.push({ type: "p", text: clean(line) });
    }
  }
  return blocks;
}

/** Strip markdown inline syntax and make links readable. */
function clean(text: string): string {
  return sanitize(
    text
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
  );
}

/** Helvetica is WinAnsi-only; map common unicode, drop the rest. */
function sanitize(text: string): string {
  const map: Record<string, string> = {
    "–": "-",
    "—": "-",
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "…": "...",
    "→": "->",
    " ": " ",
  };
  return text
    .replace(/[–—‘’“”…→ ]/g, (c) => map[c])
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\xff•·]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
