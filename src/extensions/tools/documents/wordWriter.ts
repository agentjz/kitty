import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

export async function createWordDocument(input: {
  title?: string;
  content: string;
}): Promise<Buffer> {
  const children: Paragraph[] = [];
  if (input.title?.trim()) {
    children.push(new Paragraph({
      text: input.title.trim(),
      heading: HeadingLevel.TITLE,
    }));
  }

  for (const rawLine of input.content.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      children.push(new Paragraph({
        text: heading[2] ?? "",
        heading: headingLevel(heading[1]?.length ?? 1),
      }));
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      children.push(new Paragraph({
        children: [new TextRun(bullet[1] ?? "")],
        bullet: { level: 0 },
      }));
      continue;
    }

    children.push(new Paragraph({ children: [new TextRun(line)] }));
  }

  if (children.length === 0) {
    children.push(new Paragraph(""));
  }

  const document = new Document({ sections: [{ children }] });
  return Packer.toBuffer(document);
}

function headingLevel(level: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  if (level === 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  return HeadingLevel.HEADING_3;
}
