/**
 * Extração de texto de documentos.
 * Suporta: PDF (pdf-parse), DOCX (mammoth), TXT e MD (passthrough).
 */

export async function extractText(buffer: Buffer, sourceType: string): Promise<string> {
  switch (sourceType.toLowerCase()) {
    case 'pdf':
      return extractPdf(buffer);
    case 'docx':
      return extractDocx(buffer);
    case 'txt':
    case 'md':
    case 'markdown':
      return buffer.toString('utf-8');
    default:
      return buffer.toString('utf-8');
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const mod = await import('pdf-parse').catch(() => null);
  if (!mod) throw new Error('Módulo pdf-parse não está instalado. Execute: npm install pdf-parse');
  const pdfParse = mod.default ?? mod;
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth').catch(() => null);
  if (!mammoth) throw new Error('Módulo mammoth não está instalado. Execute: npm install mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
