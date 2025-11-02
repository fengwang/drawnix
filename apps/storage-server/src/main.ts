import http, { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { URL } from 'url';
import fs from 'fs/promises';
import { constants as fsConstants, createReadStream, existsSync, mkdirSync, statSync } from 'fs';

type StoredFileMeta = {
  name: string;
  size: number;
  modified: string;
  url: string;
};

type FilePayload = {
  name?: string;
  content?: unknown;
};

const DEFAULT_STORAGE_DIR = '/storage';
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? DEFAULT_STORAGE_DIR);
const CLIENT_DIST_DIR = path.resolve(__dirname, '../web');

if (!existsSync(STORAGE_DIR)) {
  mkdirSync(STORAGE_DIR, { recursive: true });
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const server = http.createServer(async (req, res) => {
  try {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    if (!req.url) {
      sendError(res, 400, 'Invalid request URL');
      return;
    }

    const parsedUrl = new URL(req.url, getOrigin(req));
    const segments = parsedUrl.pathname.split('/').filter(Boolean);

    if (segments[0] === 'api' && segments[1] === 'files') {
      await handleApiRequest(req, res, segments.slice(2));
      return;
    }

    if (segments[0] === 'public') {
      await handlePublicRequest(req, res, segments.slice(1));
      return;
    }

    await serveStatic(res, parsedUrl.pathname);
  } catch (error) {
    if (error instanceof HttpError) {
      sendError(res, error.status, error.message);
      return;
    }
    console.error(error);
    sendError(res, 500, error instanceof Error ? error.message : 'Internal server error');
  }
});

server.listen(PORT, () => {
  console.log(`Storage server listening on port ${PORT}`);
  console.log(`Serving storage directory at ${STORAGE_DIR}`);
});

async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  rest: string[]
): Promise<void> {
  const method = req.method ?? 'GET';
  if (rest.length === 0) {
    if (method === 'GET') {
      await listFiles(req, res);
      return;
    }
    if (method === 'POST') {
      await createFile(req, res);
      return;
    }
    sendError(res, 405, 'Method not allowed');
    return;
  }

  const rawName = decodeURIComponent(rest.join('/'));
  if (!rawName) {
    sendError(res, 400, 'File name is required');
    return;
  }

  if (method === 'GET') {
    await readFile(res, rawName);
    return;
  }
  if (method === 'PUT') {
    await updateFile(req, res, rawName);
    return;
  }
  if (method === 'DELETE') {
    await deleteFile(res, rawName);
    return;
  }

  sendError(res, 405, 'Method not allowed');
}

async function listFiles(req: IncomingMessage, res: ServerResponse) {
  const origin = getOrigin(req);
  const entries = await fs.readdir(STORAGE_DIR);
  const drawFiles = entries.filter((file) => file.endsWith('.drawnix'));
  const metas = await Promise.all(drawFiles.map(async (name) => describeFile(name, origin)));
  sendJson(res, 200, metas);
}

async function createFile(req: IncomingMessage, res: ServerResponse) {
  const payload = await readJsonBody<FilePayload>(req);
  if (!payload.name) {
    sendError(res, 400, '`name` is required');
    return;
  }
  const resolved = resolveFileName(payload.name);
  if (await exists(resolved.fullPath)) {
    sendError(res, 409, 'File already exists');
    return;
  }
  const serialized = serializeContent(payload.content);
  await fs.writeFile(resolved.fullPath, serialized, 'utf8');
  const meta = await describeFile(resolved.fileName, getOrigin(req));
  sendJson(res, 201, meta);
}

async function readFile(res: ServerResponse, rawName: string) {
  const resolved = resolveFileName(rawName);
  if (!(await exists(resolved.fullPath))) {
    sendError(res, 404, 'File not found');
    return;
  }
  const content = await fs.readFile(resolved.fullPath, 'utf8');
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(content);
}

async function updateFile(req: IncomingMessage, res: ServerResponse, rawName: string) {
  const resolved = resolveFileName(rawName);
  if (!(await exists(resolved.fullPath))) {
    sendError(res, 404, 'File not found');
    return;
  }
  const payload = await readJsonBody<FilePayload>(req);
  const next = payload.name ? resolveFileName(payload.name) : resolved;
  if (next.fileName !== resolved.fileName && (await exists(next.fullPath))) {
    sendError(res, 409, 'A file with the requested name already exists');
    return;
  }

  if (next.fileName !== resolved.fileName) {
    await fs.rename(resolved.fullPath, next.fullPath);
  }

  if (payload.content !== undefined) {
    const serialized = serializeContent(payload.content);
    await fs.writeFile(next.fullPath, serialized, 'utf8');
  }

  const meta = await describeFile(next.fileName, getOrigin(req));
  sendJson(res, 200, meta);
}

async function deleteFile(res: ServerResponse, rawName: string) {
  const resolved = resolveFileName(rawName);
  if (!(await exists(resolved.fullPath))) {
    sendError(res, 404, 'File not found');
    return;
  }
  await fs.unlink(resolved.fullPath);
  sendJson(res, 204, null);
}

async function handlePublicRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  rest: string[]
) {
  if (rest.length === 0) {
    sendError(res, 400, 'File name is required');
    return;
  }
  const requested = resolveFileName(decodeURIComponent(rest.join('/')));
  if (!existsSync(requested.fullPath)) {
    sendError(res, 404, 'File not found');
    return;
  }
  const indexPath = path.join(CLIENT_DIST_DIR, 'index.html');
  if (!existsSync(indexPath)) {
    sendError(res, 500, 'Viewer unavailable');
    return;
  }

  try {
    const html = await fs.readFile(indexPath, 'utf8');
    const shareScript = `<script>window.__DRAWNIX_PUBLIC_FILE__ = ${JSON.stringify(
      requested.fileName
    )};</script>`;
    const responseHtml = html.includes('</head>')
      ? html.replace('</head>', `${shareScript}\n</head>`)
      : `${shareScript}${html}`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(responseHtml);
  } catch (error) {
    console.error('Failed to serve viewer page', error);
    sendError(res, 500, 'Failed to load viewer');
  }
}

async function serveStatic(res: ServerResponse, requestPath: string) {
  let relativePath = decodeURIComponent(requestPath);
  if (relativePath === '/' || relativePath === '') {
    relativePath = '/index.html';
  } else if (relativePath.endsWith('/')) {
    relativePath = `${relativePath}index.html`;
  }

  const candidate = path.join(CLIENT_DIST_DIR, relativePath);
  if (!candidate.startsWith(CLIENT_DIST_DIR)) {
    sendError(res, 403, 'Forbidden');
    return;
  }

  try {
    await fs.access(candidate, fsConstants.R_OK);
    const ext = path.extname(candidate);
    const type = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    createReadStream(candidate).pipe(res);
  } catch {
    const fallback = path.join(CLIENT_DIST_DIR, 'index.html');
    if (!existsSync(fallback)) {
      sendError(res, 404, 'Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'] });
    createReadStream(fallback).pipe(res);
  }
}

function resolveFileName(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new HttpError(400, 'File name cannot be empty');
  }
  const base = path.basename(trimmed);
  const sanitized = base.replace(/[^a-zA-Z0-9-_. ]/g, '_');
  const fileName = sanitized.toLowerCase().endsWith('.drawnix')
    ? sanitized
    : `${sanitized}.drawnix`;
  const fullPath = path.join(STORAGE_DIR, fileName);
  if (!fullPath.startsWith(STORAGE_DIR)) {
    throw new HttpError(400, 'Invalid file path');
  }
  return { fileName, fullPath };
}

async function describeFile(name: string, origin: string): Promise<StoredFileMeta> {
  const fullPath = path.join(STORAGE_DIR, name);
  const stats = statSync(fullPath);
  return {
    name,
    size: stats.size,
    modified: stats.mtime.toISOString(),
    url: `${origin}/public/${encodeURIComponent(name)}`
  };
}

function serializeContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  return `${JSON.stringify(content ?? { children: [] }, null, 2)}\n`;
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const body = await readBody(req);
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    console.error('Failed to parse JSON body', error);
    throw new HttpError(400, 'Invalid JSON payload');
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    if (chunk instanceof Buffer) {
      chunks.push(chunk);
    } else {
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function exists(pathname: string): Promise<boolean> {
  try {
    await fs.access(pathname, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  if (status === 204) {
    res.writeHead(204).end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, status: number, message: string) {
  sendJson(res, status, { error: message });
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin ?? '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,DELETE,OPTIONS'
  );
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getOrigin(req: IncomingMessage): string {
  const protoHeader = req.headers['x-forwarded-proto'];
  const isEncrypted =
    !!(req.socket as unknown as { encrypted?: boolean })?.encrypted;
  const proto = Array.isArray(protoHeader)
    ? protoHeader[0]
    : protoHeader ?? (isEncrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? `localhost:${PORT}`;
  return `${proto}://${host}`;
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
