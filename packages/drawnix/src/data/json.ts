import { PlaitBoard, PlaitElement } from '@plait/core';
import { MIME_TYPES, VERSIONS } from '../constants';
import { fileOpen, fileSave } from './filesystem';
import { DrawnixExportedData, DrawnixExportedType } from './types';
import { loadFromBlob, normalizeFile, parseFileContents } from './blob';
import { DrawnixExportedData, DrawnixExportedType } from './types';
import type { PlaitElement } from '@plait/core';
type MarkdownModule = typeof import('@plait-board/markdown-to-drawnix');
type MermaidModule = typeof import('@plait-board/mermaid-to-drawnix');

export const getDefaultName = () => {
  const time = new Date().getTime();
  return time.toString();
};

export const saveAsJSON = async (
  board: PlaitBoard,
  name: string = getDefaultName()
) => {
  const serialized = serializeAsJSON(board);
  const blob = new Blob([serialized], {
    type: MIME_TYPES.drawnix,
  });

  const fileHandle = await fileSave(blob, {
    name,
    extension: 'drawnix',
    description: 'Drawnix file',
  });
  return { fileHandle };
};

export const loadFromJSON = async (board: PlaitBoard) => {
  const file = await fileOpen({
    description: 'Drawnix files',
    // ToDo: Be over-permissive until https://bugs.webkit.org/show_bug.cgi?id=34442
    // gets resolved. Else, iOS users cannot open `.drawnix` files.
    // extensions: ["json", "drawnix", "png", "svg"],
  });
  const normalized = await normalizeFile(file);
  const extension = extractExtension(normalized.name || file.name || '');
  const mimeType = normalized.type || file.type || '';

  if (isMarkdownFile(extension, mimeType)) {
    return importMarkdownFile(normalized);
  }

  if (isMermaidFile(extension, mimeType)) {
    return importMermaidFile(normalized);
  }

  return loadFromBlob(board, normalized);
};

export const isValidDrawnixData = (data?: any): data is DrawnixExportedData => {
  return (
    data &&
    data.type === DrawnixExportedType.drawnix &&
    Array.isArray(data.elements) &&
    typeof data.viewport === 'object'
  );
};

export const serializeAsJSON = (board: PlaitBoard): string => {
  const data = {
    type: DrawnixExportedType.drawnix,
    version: VERSIONS.drawnix,
    source: 'web',
    elements: board.children,
    viewport: board.viewport,
  };

  return JSON.stringify(data, null, 2);
};

const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mdtxt'];
const MERMAID_EXTENSIONS = ['mmd', 'mermaid', 'mm'];

const MARKDOWN_MIME_TYPES = [
  'text/markdown',
  'text/x-markdown',
  'text/plain',
];

const MERMAID_MIME_TYPES = ['text/mermaid', 'text/x-mermaid'];

const extractExtension = (name: string) => {
  const idx = name.lastIndexOf('.');
  if (idx === -1) {
    return '';
  }
  return name.slice(idx + 1).toLowerCase();
};

const isMarkdownFile = (ext: string, mime: string) => {
  return (
    MARKDOWN_EXTENSIONS.includes(ext) ||
    MARKDOWN_MIME_TYPES.includes(mime.toLowerCase())
  );
};

const isMermaidFile = (ext: string, mime: string) => {
  return (
    MERMAID_EXTENSIONS.includes(ext) ||
    MERMAID_MIME_TYPES.includes(mime.toLowerCase())
  );
};

const createImportedData = (elements: PlaitElement[]): DrawnixExportedData => {
  return {
    type: DrawnixExportedType.drawnix,
    version: VERSIONS.drawnix,
    source: 'web',
    elements,
    viewport: {
      zoom: 1,
    },
  };
};

const importMarkdownFile = async (file: File): Promise<DrawnixExportedData> => {
  const contents = (await parseFileContents(file)).trim();
  if (!contents) {
    throw new Error('The selected markdown file is empty.');
  }
  const module = await import('@plait-board/markdown-to-drawnix');
  let mind = await tryParseMarkdown(module, contents);
  if (!mind) {
    throw new Error('Failed to convert markdown file.');
  }
  mind.points = [[0, 0]];
  return createImportedData([mind]);
};

const tryParseMarkdown = async (
  module: MarkdownModule,
  contents: string
) => {
  try {
    return await module.parseMarkdownToDrawnix(contents);
  } catch (error) {
    if (contents.includes('"')) {
      return module.parseMarkdownToDrawnix(contents.replace(/"/g, "'"));
    }
    throw error;
  }
};

const importMermaidFile = async (file: File): Promise<DrawnixExportedData> => {
  const contents = (await parseFileContents(file)).trim();
  if (!contents) {
    throw new Error('The selected mermaid file is empty.');
  }
  const module = await import('@plait-board/mermaid-to-drawnix');
  const result = await tryParseMermaid(module, contents);
  if (!result?.elements?.length) {
    throw new Error('Failed to convert mermaid file.');
  }
  return createImportedData(result.elements);
};

const tryParseMermaid = async (
  module: MermaidModule,
  contents: string
) => {
  try {
    return await module.parseMermaidToDrawnix(contents);
  } catch (error) {
    if (contents.includes('"')) {
      return module.parseMermaidToDrawnix(contents.replace(/"/g, "'"));
    }
    throw error;
  }
};
