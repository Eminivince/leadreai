import { chromium, type Browser, type BrowserContext } from 'playwright';
import { Redis } from 'ioredis';
import { load as cheerioLoad } from 'cheerio';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { SerpResult } from './serpScraper.js';

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?[\d\s\-().]{7,20})/g;
const FILE_EXT_REGEX = /\.(pdf|docx?|xlsx?)(\?[^"']*)?$/i;
const SKIP_DOMAINS = ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com', 'google.com'];

export interface PageScrapedData {
  url: string;
  emails: string[];        // raw email strings found on page
  phones: string[];        // raw phone strings found on page
  fileUrls: string[];      // absolute URLs to downloadable files (.pdf/.docx/.doc/.xlsx/.xls)
  companyName?: string;    // from OpenGraph og:site_name or JSON-LD
  linkedinUrl?: string;    // linkedin.com/company/... URL found on page
  pageText: string;        // first 2000 chars of visible text (for fallback extraction)
}

export async function runPageScraper(
  serpResults: SerpResult[],
  publisher: Redis,
  jobId: string
): Promise<PageScrapedData[]> {
  // Skip file URLs — those go to fileExtractor
  const pageUrls = serpResults.filter(
    r => !r.isFilePath && !SKIP_DOMAINS.some(d => r.url.includes(d))
  );
  const fileUrls = serpResults.filter(r => r.isFilePath).map(r => r.url);

  const browser = await chromium.launch({ headless: env.PLAYWRIGHT_HEADLESS });
  const results: PageScrapedData[] = [];
  const semaphore = new Semaphore(env.PLAYWRIGHT_CONCURRENCY);

  try {
    await Promise.all(
      pageUrls.map(serpResult =>
        semaphore
          .run(() => scrapePage(browser, serpResult.url, fileUrls))
          .then(data => {
            if (data) results.push(data);
          })
          .catch(err =>
            logger.warn('Page scrape failed', { url: serpResult.url, err })
          )
      )
    );
  } finally {
    await browser.close();
  }

  // Add file URLs gathered from snippet-only results
  if (fileUrls.length > 0) {
    const fileOnlyData: PageScrapedData = {
      url: 'collected-files',
      emails: [],
      phones: [],
      fileUrls,
      pageText: '',
    };
    results.push(fileOnlyData);
  }

  logger.info('Page scraper complete', { pages: pageUrls.length, results: results.length });
  return results;
}

async function scrapePage(
  browser: Browser,
  url: string,
  collectedFileUrls: string[]
): Promise<PageScrapedData | null> {
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({
      userAgent: randomUserAgent(),
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    await page.goto(url, {
      timeout: env.PLAYWRIGHT_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });

    // Dismiss common cookie banners
    for (const selector of [
      'button:has-text("Accept")',
      'button:has-text("Accept All")',
      '[id*="cookie"] button',
      '[class*="cookie"] button',
    ]) {
      await page.click(selector, { timeout: 2000 }).catch(() => {});
    }

    const html = await page.content();
    const $ = cheerioLoad(html);

    // Remove script/style noise
    $('script, style, nav, footer').remove();

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    // Extract emails from page text
    const emailSet = new Set<string>(bodyText.match(EMAIL_REGEX) ?? []);
    // Also check mailto: links
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const email = href.replace('mailto:', '').split('?')[0];
      if (email) emailSet.add(email);
    });
    const emailMatches = [...emailSet];

    // Extract phones from tel: links (PHONE_REGEX kept for reference but tel: links are more reliable)
    const phoneMatches: string[] = [];
    $('a[href^="tel:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const phone = href.replace('tel:', '');
      if (phone) phoneMatches.push(phone);
    });

    // Extract file links
    const foundFileUrls: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (FILE_EXT_REGEX.test(href)) {
        const absolute = href.startsWith('http') ? href : new URL(href, url).href;
        foundFileUrls.push(absolute);
        collectedFileUrls.push(absolute);
      }
    });

    // Company name from OpenGraph
    const companyName =
      $('meta[property="og:site_name"]').attr('content') ??
      $('meta[name="application-name"]').attr('content') ??
      undefined;

    // LinkedIn URL
    let linkedinUrl: string | undefined;
    $('a[href*="linkedin.com/company"]').each((_, el) => {
      if (!linkedinUrl) linkedinUrl = $(el).attr('href');
    });

    // Small rate-limit delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    return {
      url,
      emails: emailMatches.filter(e => e.includes('@') && !e.includes('example.com')),
      phones: phoneMatches,
      fileUrls: foundFileUrls,
      companyName,
      linkedinUrl,
      pageText: bodyText.slice(0, 2000),
    };
  } catch (err) {
    logger.warn('scrapePage error', { url, err });
    return null;
  } finally {
    await context?.close();
  }
}

// Simple semaphore for concurrency control
class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];
  constructor(private max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  private release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) {
      this.current++;
      next();
    }
  }
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ?? USER_AGENTS[0]!;
}

// Suppress unused-variable warning for PHONE_REGEX — retained for future text-based extraction
void PHONE_REGEX;
