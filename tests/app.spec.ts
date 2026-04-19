import { expect, test } from '@playwright/test';

test('records and rehearses a one-round script', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');

  await page.locator('.topbar .icon-button').nth(1).click();
  const editorInput = page.locator('.sheet .composer__textarea');
  await editorInput.fill('你好');
  await page.locator('.sheet .composer__circle-button').first().click();
  await page.locator('.segmented-control__item').nth(1).click();
  await editorInput.fill('你好呀');
  await page.locator('.sheet .composer__circle-button').first().click();
  await expect(page.locator('.sheet__header-actions .primary-button')).toBeEnabled();
  await page.locator('.sheet__header-actions .primary-button').click();

  const rehearsalInput = page.locator('.footer-panel .composer__textarea');
  await rehearsalInput.fill('你好');
  await page.keyboard.press('Enter');

  await expect(page.getByText('你好呀')).toBeVisible();
  await expect(page.getByText('剧本已排练完毕！')).toBeVisible();
});

test('resets the current turn after a mismatch', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');

  await page.locator('.topbar .icon-button').nth(1).click();
  const editorInput = page.locator('.sheet .composer__textarea');
  await editorInput.fill('第一句');
  await page.locator('.sheet .composer__circle-button').first().click();
  await editorInput.fill('第二句');
  await page.locator('.sheet .composer__circle-button').first().click();
  await page.locator('.segmented-control__item').nth(1).click();
  await editorInput.fill('对方回复');
  await page.locator('.sheet .composer__circle-button').first().click();
  await page.locator('.sheet__header-actions .primary-button').click();

  const rehearsalInput = page.locator('.footer-panel .composer__textarea');
  await rehearsalInput.fill('第一句');
  await page.keyboard.press('Enter');
  await rehearsalInput.fill('错了');
  await page.keyboard.press('Enter');

  await expect(page.getByText('台词不对，重新来过')).toBeVisible();
});

test('keeps the outer page locked while only the chat area can scroll', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');
  await page.locator('.chat-list').waitFor();

  const layout = await page.evaluate(() => ({
    htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    bodyPosition: getComputedStyle(document.body).position,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    bodyTouchAction: getComputedStyle(document.body).touchAction,
    mainDisplay: getComputedStyle(document.querySelector('.main-panel')!).display,
    mainPaddingTop: getComputedStyle(document.querySelector('.main-panel')!).paddingTop,
    mainPaddingBottom: getComputedStyle(document.querySelector('.main-panel')!).paddingBottom,
    appOverflowX: getComputedStyle(document.querySelector('.app-shell')!).overflowX,
    appOverflowY: getComputedStyle(document.querySelector('.app-shell')!).overflowY,
    appTouchAction: getComputedStyle(document.querySelector('.app-shell')!).touchAction,
    topbarPosition: getComputedStyle(document.querySelector('.topbar')!).position,
    chatOverflowY: getComputedStyle(document.querySelector('.chat-list')!).overflowY,
    chatTouchAction: getComputedStyle(document.querySelector('.chat-list')!).touchAction
  }));

  expect(layout).toEqual({
    htmlOverflowX: 'hidden',
    htmlOverflowY: 'hidden',
    bodyPosition: 'fixed',
    bodyOverflowX: 'hidden',
    bodyOverflowY: 'hidden',
    bodyTouchAction: 'none',
    mainDisplay: 'flex',
    mainPaddingTop: '14px',
    mainPaddingBottom: '18px',
    appOverflowX: 'hidden',
    appOverflowY: 'hidden',
    appTouchAction: 'none',
    topbarPosition: 'relative',
    chatOverflowY: 'hidden',
    chatTouchAction: 'pan-y'
  });
});

test('keeps the editor sheet aligned to the visible viewport', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173');

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--app-viewport-height', '688px');
    document.documentElement.style.setProperty('--app-viewport-top', '44px');
    document.documentElement.style.setProperty('--app-viewport-bottom', '36px');
  });

  await page.locator('.topbar .icon-button').nth(1).click();
  await page.locator('.sheet').waitFor();

  const overlayLayout = await page.evaluate(() => {
    const overlay = document.querySelector('.overlay--sheet') as HTMLElement | null;
    const sheet = document.querySelector('.sheet') as HTMLElement | null;
    const overlayRect = overlay?.getBoundingClientRect();
    const sheetRect = sheet?.getBoundingClientRect();

    return {
      overlayTop: overlayRect ? Math.round(overlayRect.top) : null,
      overlayHeight: overlayRect ? Math.round(overlayRect.height) : null,
      sheetHeight: sheetRect ? Math.round(sheetRect.height) : null
    };
  });

  expect(overlayLayout).toEqual({
    overlayTop: 44,
    overlayHeight: 688,
    sheetHeight: 688
  });
});
