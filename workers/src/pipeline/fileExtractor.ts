import { createRequire } from 'module';
import axios from 'axios';
import type { AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { chromium } from 'playwright';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// pdf-parse is CJS — use createRequire so we get the function directly
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfParseFn = _require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;

export interface ExtractedFileData {
  url: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'unknown';
  emails: string[];
  phones: string[];
  rows?: Array<Record<string, string>>; // structured rows from XLSX only
  textSnippet: string; // first 1000 chars of extracted text
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /\+?[\d][\d\s\-().]{6,18}[\d]/g;
const MAX_BYTES = env.MAX_FILE_DOWNLOAD_SIZE_MB * 1024 * 1024;

// Configure axios — only retry transient / 5xx errors (4xx like 403/467 never succeed on repeat)
const client = axios.create({ responseType: 'arraybuffer', timeout: 30000 });
axiosRetry(client, {
  retries: 2,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error: AxiosError) => {
    const status = error.response?.status;
    if (status !== undefined && status < 500) return false;
    return axiosRetry.isNetworkOrIdempotentRequestError(error);
  },
});

/** Same family as pageScraper — many CDNs/WAFs block non-browser User-Agents. */
const CHROME_LIKE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function refererHeadersForUrl(fileUrl: string): Record<string, string> {
  try {
    const u = new URL(fileUrl);
    const origin = u.origin;
    return {
      'User-Agent': CHROME_LIKE_UA,
      Referer: `${origin}/`,
      Origin: origin,
      'Accept-Language': 'en-US,en;q=0.9',
    };
  } catch {
    return { 'User-Agent': CHROME_LIKE_UA, 'Accept-Language': 'en-US,en;q=0.9' };
  }
}

function acceptHeaderForType(fileType: string): string {
  if (fileType === 'pdf') return 'application/pdf,application/octet-stream,*/*;q=0.8';
  if (fileType === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/octet-stream,*/*;q=0.8';
  }
  if (fileType === 'xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*;q=0.8';
  }
  return '*/*';
}

/**
 * When plain HTTP gets 403/467/etc., fetch the asset through a real browser context.
 * Visits site origin first so WordPress / Akamai-style rules often allow the PDF request.
 */
async function downloadFileViaPlaywright(
  url: string,
  fileType: 'pdf' | 'docx' | 'xlsx',
): Promise<Buffer | null> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: env.PLAYWRIGHT_HEADLESS });
    const context = await browser.newContext({
      userAgent: CHROME_LIKE_UA,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    let origin = '';
    try {
      origin = new URL(url).origin;
    } catch {
      /* invalid url — still try direct goto */
    }

    if (origin) {
      await page.goto(origin, {
        timeout: Math.min(env.PLAYWRIGHT_TIMEOUT_MS, 25_000),
        waitUntil: 'domcontentloaded',
      }).catch(() => {});
    }

    const response = await page.goto(url, {
      timeout: Math.min(env.PLAYWRIGHT_TIMEOUT_MS, 45_000),
      waitUntil: 'commit',
    });

    if (!response) {
      logger.warn('Playwright file fetch: no response', { url });
      return null;
    }

    const status = response.status();
    if (status < 200 || status >= 300) {
      logger.warn('Playwright file fetch: non-OK status', { url, status });
      return null;
    }

    const buf = Buffer.from(await response.body());
    if (buf.length > MAX_BYTES) {
      logger.warn('Playwright file fetch: over size limit', { url, bytes: buf.length });
      return null;
    }

    logger.info('Playwright file fetch succeeded', { url, fileType, bytes: buf.length });
    return buf;
  } catch (err) {
    logger.warn('Playwright file fetch failed', {
      url,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    await browser?.close();
  }
}

export async function runFileExtractor(fileUrls: string[]): Promise<ExtractedFileData[]> {
  const uniqueUrls = [...new Set(fileUrls.map((u) => u.trim()).filter(Boolean))];
  const results: ExtractedFileData[] = [];
  for (const url of uniqueUrls) {
    try {
      const data = await extractFile(url);
      if (data) results.push(data);
    } catch (err) {
      logger.warn('File extraction failed', { url, err });
    }
  }
  logger.info('File extractor complete', {
    files: uniqueUrls.length,
    extracted: results.length,
  });
  return results;
}

async function extractFile(url: string): Promise<ExtractedFileData | null> {
  const ext = (url.split('?')[0] ?? '').split('.').pop()?.toLowerCase() ?? '';
  const fileType = ext === 'pdf' ? 'pdf'
    : (ext === 'docx' || ext === 'doc') ? 'docx'
    : (ext === 'xlsx' || ext === 'xls') ? 'xlsx'
    : 'unknown';

  if (fileType === 'unknown') return null;

  const baseHeaders = {
    ...refererHeadersForUrl(url),
    Accept: acceptHeaderForType(fileType),
  };

  let buffer: Buffer | null = null;
  try {
    const response = await client.get<ArrayBuffer>(url, {
      headers: baseHeaders,
      maxContentLength: MAX_BYTES,
    });
    buffer = Buffer.from(response.data);
  } catch (firstErr) {
    const status = (firstErr as AxiosError).response?.status;
    const shouldTryBrowser =
      status === undefined || status >= 400;

    if (shouldTryBrowser) {
      buffer = await downloadFileViaPlaywright(url, fileType);
    }

    if (!buffer) throw firstErr;
  }

  if (!buffer) return null;

  if (fileType === 'pdf') return extractPdf(url, buffer);
  if (fileType === 'docx') return extractDocx(url, buffer);
  if (fileType === 'xlsx') return extractXlsx(url, buffer);
  return null;
}

async function extractPdf(url: string, buffer: Buffer): Promise<ExtractedFileData> {
  const result = await pdfParseFn(buffer);
  const text = result.text;
  const emails: string[] = [...new Set<string>(text.match(EMAIL_REGEX) ?? [])];
  const phones: string[] = [...new Set<string>(text.match(PHONE_REGEX) ?? [])];
  return { url, fileType: 'pdf', emails, phones, textSnippet: text.slice(0, 1000) };
}

async function extractDocx(url: string, buffer: Buffer): Promise<ExtractedFileData> {
  // mammoth has no @types — use dynamic import with any cast
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = await import('mammoth') as any;
  const result = await mammoth.extractRawText({ buffer });
  const text = (result.value as string) ?? '';
  const emails: string[] = [...new Set<string>(text.match(EMAIL_REGEX) ?? [])];
  const phones: string[] = [...new Set<string>(text.match(PHONE_REGEX) ?? [])];
  return { url, fileType: 'docx', emails, phones, textSnippet: text.slice(0, 1000) };
}

async function extractXlsx(url: string, buffer: Buffer): Promise<ExtractedFileData> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const emails: string[] = [];
  const phones: string[] = [];
  const rows: Array<Record<string, string>> = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    // Detect header keywords for structured extraction
    const HEADER_KEYWORDS = ['company', 'email', 'phone', 'address', 'name', 'contact', 'website'];
    const firstRow = jsonRows[0] ?? {};
    const headers = Object.keys(firstRow).map(k => k.toLowerCase());
    const isStructured = headers.some(h => HEADER_KEYWORDS.some(kw => h.includes(kw)));

    for (const row of jsonRows.slice(0, 500)) {
      const rowText = Object.values(row).join(' ');
      const rowEmails = rowText.match(EMAIL_REGEX) ?? [];
      const rowPhones = rowText.match(PHONE_REGEX) ?? [];
      emails.push(...rowEmails);
      phones.push(...rowPhones);
      if (isStructured) {
        rows.push(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)])));
      }
    }
  }

  return {
    url,
    fileType: 'xlsx',
    emails: [...new Set<string>(emails)],
    phones: [...new Set<string>(phones)],
    rows: rows.length > 0 ? rows.slice(0, 200) : undefined,
    textSnippet: rows.slice(0, 3).map(r => Object.values(r).join(' ')).join('\n').slice(0, 1000),
  };
}
