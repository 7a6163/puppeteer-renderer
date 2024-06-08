import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import waitForAnimations from './wait-for-animations';
import {
  PageOptions,
  PageViewportOptions,
  PdfOptions,
  ScreenshotOptions,
} from './validate-schema';
import fs from 'fs-extra';

export class Renderer {
  private browser: Browser;
  private chromeTmpDataDir: string | null = null;

  constructor(browser: Browser, chromeTmpDataDir: string | null) {
    this.browser = browser;
    this.chromeTmpDataDir = chromeTmpDataDir;
  }

  async html(url: string, pageOptions: PageOptions) {
    let page: Page | undefined;

    try {
      page = await this.createPage(url, pageOptions);
      const html = await page.content();
      return html;
    } finally {
      await this.closePage(page);
    }
  }

  async pdf(url: string, pageOptions: PageOptions, pdfOptions: PdfOptions) {
    let page: Page | undefined;

    try {
      page = await this.createPage(url, {
        ...pageOptions,
        emulateMediaType: pageOptions.emulateMediaType || 'print',
      });

      const buffer = await page.pdf(pdfOptions);
      return buffer;
    } finally {
      await this.closePage(page);
    }
  }

  async screenshot(
    url: string,
    pageOptions: PageOptions,
    pageViewportOptions: PageViewportOptions,
    screenshotOptions: ScreenshotOptions
  ) {
    let page: Page | undefined;

    try {
      page = await this.createPage(url, pageOptions);

      await page.setViewport(pageViewportOptions);

      const { animationTimeout, ...options } = screenshotOptions;

      if (animationTimeout > 0) {
        await waitForAnimations(page, screenshotOptions, animationTimeout);
      }

      const buffer = await page.screenshot({
        ...options,
        quality: options.type === 'png' ? undefined : options.quality,
      });

      return {
        type: options.type,
        buffer,
      };
    } finally {
      await this.closePage(page);
    }
  }

  private async createPage(url: string, pageOptions: PageOptions) {
    let page: Page | undefined;

    try {
      page = await this.browser.newPage();

      page.on('error', (error) => {
        throw error;
      });

      const { credentials, emulateMediaType, headers, ...options } = pageOptions;

      if (headers) {
        await page.setExtraHTTPHeaders(JSON.parse(headers));
      }
      if (emulateMediaType) {
        await page.emulateMediaType(emulateMediaType);
      }
      if (credentials) {
        await page.authenticate(credentials);
      }

      await page.setCacheEnabled(false);
      await page.goto(url, options);

      return page;
    } catch (e) {
      console.error(e);
      await this.closePage(page);
      throw e;
    }
  }

  private async closePage(page?: Page) {
    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
    } catch (e) {
      // ignore
    }
  }

  async close() {
    await this.browser.close();

    if (this.chromeTmpDataDir) {
      fs.removeSync(this.chromeTmpDataDir);
    }
  }
}

export let renderer: Renderer | undefined;

export default async function create(options: PuppeteerLaunchOptions = {}) {
  if (!options.args) {
    options.args = [];
  }

  options.args.push('--no-sandbox');
  options.args.push('--disable-web-security');
  options.args.push('--disable-dev-shm-usage');
  options.args.push('--disk-cache-size=0');
  options.args.push('--aggressive-cache-discard');

  const browser = await puppeteer.launch({
    ...options,
    headless: 'new'
  });

  // Extract temporary data directory
  let chromeTmpDataDir: string | null = null;
  const chromeSpawnArgs = browser.process()?.spawnargs || [];
  for (const arg of chromeSpawnArgs) {
    if (arg.startsWith("--user-data-dir=")) {
      chromeTmpDataDir = arg.replace("--user-data-dir=", "");
      break;
    }
  }

  renderer = new Renderer(browser, chromeTmpDataDir);

  console.info(`Initialized renderer.`, options);

  return renderer;
}
