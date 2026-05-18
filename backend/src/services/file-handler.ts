export interface UploadResult {
  fileName: string;
  fileType: string;
  extractedText?: string;
  base64?: string;
  mode: 'vision' | 'text';
  extractedTextLength?: number;
  warning?: string;
}

export async function extractTextFromFile(fileType: string, buffer: Buffer): Promise<string | null> {
  if (fileType === 'application/pdf') {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const data = new Uint8Array(buffer);
      const pdf = await pdfjs.getDocument({ data }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      }
      return text.slice(0, 10000);
    } catch {
      return null;
    }
  }

  if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileType === 'application/msword') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value.slice(0, 10000);
    } catch {
      return null;
    }
  }

  if (fileType.startsWith('text/') || isTextFile(fileType)) {
    try {
      return buffer.toString('utf-8').slice(0, 10000);
    } catch {
      return null;
    }
  }

  return null;
}

export function fileToBase64(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function isTextFile(fileType: string): boolean {
  const textTypes = [
    'application/json',
    'application/javascript',
    'application/typescript',
    'application/x-javascript',
    'application/xml',
    'application/x-yaml',
    'application/toml',
  ];
  return textTypes.includes(fileType);
}

export function isImageFile(fileType: string): boolean {
  return fileType.startsWith('image/');
}

export function isWordFile(fileType: string): boolean {
  return fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
         fileType === 'application/msword';
}

export function isSupportedFile(fileType: string): boolean {
  if (isImageFile(fileType)) return true;
  if (fileType === 'application/pdf') return true;
  if (isWordFile(fileType)) return true;
  if (fileType.startsWith('text/')) return true;
  if (isTextFile(fileType)) return true;
  return false;
}
