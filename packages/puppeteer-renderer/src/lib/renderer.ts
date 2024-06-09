import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer'
import waitForAnimations from './wait-for-animations'
import {
  PageOptions,
  PageViewportOptions,
  PdfOptions,
  ScreenshotOptions,
} from './validate-schema'

export class Renderer {
  private browser: Browser

  constructor(browser: Browser) {
    this.browser = browser
  }

  async html(url: string, pageOptions: PageOptions) {
    return this.withPage(async (page) => {
      await page.goto(url, pageOptions)
      return page.content()
    }, url, pageOptions)
  }

  async pdf(url: string, pageOptions: PageOptions, pdfOptions: PdfOptions) {
    return this.withPage(async (page) => {
      return page.pdf(pdfOptions)
    }, url, { ...pageOptions, emulateMediaType: pageOptions.emulateMediaType || 'print' })
  }

  async screenshot(
    url: string,
    pageOptions: PageOptions,
    pageViewportOptions: PageViewportOptions,
    screenshotOptions: ScreenshotOptions
  ) {
    return this.withPage(async (page) => {
      await page.setViewport(pageViewportOptions)
      const { animationTimeout, ...options } = screenshotOptions;

      if (animationTimeout > 0) {
        await waitForAnimations(page, screenshotOptions, animationTimeout);
      }

      return page.screenshot({
        ...options,
        quality: options.type === 'png' ? undefined : options.quality,
      });
    }, url, pageOptions);
  }

  private async withPage<T>(
    fn: (page: Page) => Promise<T>,
    url: string,
    pageOptions: PageOptions
  ): Promise<T> {
    let page: Page | undefined;

    try {
      page = await this.createPage(url, pageOptions);
      return await fn(page);
    } finally {
      await this.closePage(page);
    }
  }

  private async createPage(url: string, pageOptions: PageOptions) {
    const page = await this.browser.newPage();
    page.on('error', (error) => {
      console.error(error);
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
  }

  private async closePage(page?: Page) {
    if (page && !page.isClosed()) {
      try {
        await page.close();
      } catch (e) {
        console.error('Failed to close page:', e);
      }
    }
  }

  async close() {
    await this.browser.close()
  }
}

export let renderer: Renderer | undefined

export default async function create(options: PuppeteerLaunchOptions = {}) {
  options.args = [
    ...(options.args || []),
    '--no-sandbox',
    '--disable-web-security',
    '--disable-dev-shm-usage',
    '--disk-cache-size=0',
    '--aggressive-cache-discard',
  ]

  const browser = await puppeteer.launch({
    ...options,
    headless: 'shell',
  })

  renderer = new Renderer(browser)

  console.info(`Initialized renderer.`, options)

  return renderer
}
