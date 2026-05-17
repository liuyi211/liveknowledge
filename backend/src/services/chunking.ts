export interface Chunk {
  content: string;
  metadata: {
    sourceId: string;
    chunkIndex: number;
    headingPath?: string[];
    startIndex: number;
    endIndex: number;
  };
}

const MAX_CHUNK_SIZE = 500;
const OVERLAP = 50;

export function splitDocument(content: string, sourceId: string): Chunk[] {
  if (content.includes('#')) {
    return splitMarkdown(content, sourceId);
  }
  return splitPlainText(content, sourceId);
}

function splitMarkdown(content: string, sourceId: string): Chunk[] {
  const chunks: Chunk[] = [];
  const lines = content.split('\n');
  let currentChunk = '';
  let currentHeadings: string[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);

    if (headingMatch && currentChunk.length > MAX_CHUNK_SIZE / 2) {
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          metadata: { sourceId, chunkIndex: chunkIndex++, headingPath: [...currentHeadings], startIndex, endIndex: startIndex + currentChunk.length }
        });
      }
      currentChunk = line + '\n';
      startIndex = content.indexOf(line, startIndex);
      currentHeadings = updateHeadings(currentHeadings, headingMatch[1].length, headingMatch[2]);
    } else {
      if (headingMatch) {
        currentHeadings = updateHeadings(currentHeadings, headingMatch[1].length, headingMatch[2]);
      }
      currentChunk += line + '\n';
    }

    if (currentChunk.length >= MAX_CHUNK_SIZE) {
      const splitPoint = findSplitPoint(currentChunk, MAX_CHUNK_SIZE);
      chunks.push({
        content: currentChunk.slice(0, splitPoint).trim(),
        metadata: { sourceId, chunkIndex: chunkIndex++, headingPath: [...currentHeadings], startIndex, endIndex: startIndex + splitPoint }
      });
      currentChunk = currentChunk.slice(Math.max(0, splitPoint - OVERLAP));
      startIndex += splitPoint - OVERLAP;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      metadata: { sourceId, chunkIndex, headingPath: [...currentHeadings], startIndex, endIndex: startIndex + currentChunk.length }
    });
  }

  return chunks;
}

function splitPlainText(content: string, sourceId: string): Chunk[] {
  const chunks: Chunk[] = [];
  let remaining = content;
  let startIndex = 0;
  let chunkIndex = 0;

  while (remaining.length > 0) {
    const splitPoint = findSplitPoint(remaining, MAX_CHUNK_SIZE);
    chunks.push({
      content: remaining.slice(0, splitPoint).trim(),
      metadata: { sourceId, chunkIndex: chunkIndex++, startIndex, endIndex: startIndex + splitPoint }
    });
    remaining = remaining.slice(Math.max(0, splitPoint - OVERLAP));
    startIndex += splitPoint - OVERLAP;
  }

  return chunks;
}

function updateHeadings(headings: string[], level: number, title: string): string[] {
  const result = headings.slice(0, level - 1);
  result[level - 1] = title;
  return result;
}

function findSplitPoint(text: string, maxSize: number): number {
  if (text.length <= maxSize) return text.length;

  const sentenceMatch = text.slice(0, maxSize).match(/.*[。！？.!?]\s*/);
  if (sentenceMatch && sentenceMatch[0].length > maxSize * 0.5) {
    return sentenceMatch[0].length;
  }

  const paraMatch = text.slice(0, maxSize).match(/.*\n\s*/);
  if (paraMatch && paraMatch[0].length > maxSize * 0.5) {
    return paraMatch[0].length;
  }

  return maxSize;
}
