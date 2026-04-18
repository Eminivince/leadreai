import axios from 'axios';
import axiosRetry from 'axios-retry';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

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

// Configure axios with retry
const client = axios.create({ responseType: 'arraybuffer', timeout: 30000 });
axiosRetry(client, { retries: 2, retryDelay: axiosRetry.exponentialDelay });

export async function runFileExtractor(fileUrls: string[]): Promise<ExtractedFileData[]> {
  const results: ExtractedFileData[] = [];
  for (const url of fileUrls) {
    try {
      const data = await extractFile(url);
      if (data) results.push(data);
    } catch (err) {
      logger.warn('File extraction failed', { url, err });
    }
  }
  logger.info('File extractor complete', { files: fileUrls.length, extracted: results.length });
  return results;
}

async function extractFile(url: string): Promise<ExtractedFileData | null> {
  const ext = (url.split('?')[0] ?? '').split('.').pop()?.toLowerCase() ?? '';
  const fileType = ext === 'pdf' ? 'pdf'
    : (ext === 'docx' || ext === 'doc') ? 'docx'
    : (ext === 'xlsx' || ext === 'xls') ? 'xlsx'
    : 'unknown';

  if (fileType === 'unknown') return null;

  // Download with size limit check
  const response = await client.get<Buffer>(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 LeadreAI/1.0' },
    maxContentLength: MAX_BYTES,
  });

  const buffer = Buffer.from(response.data);

  if (fileType === 'pdf') return extractPdf(url, buffer);
  if (fileType === 'docx') return extractDocx(url, buffer);
  if (fileType === 'xlsx') return extractXlsx(url, buffer);
  return null;
}

async function extractPdf(url: string, buffer: Buffer): Promise<ExtractedFileData> {
  const pdfParse = await import('pdf-parse');
  // pdf-parse v2 ESM exports the function directly (no .default wrapper)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parseFn = (pdfParse as any).default ?? pdfParse;
  const result = await (parseFn as (buf: Buffer) => Promise<{ text: string }>)(buffer);
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
