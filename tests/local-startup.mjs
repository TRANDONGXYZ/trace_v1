// Run against a separately started local cloud-mode frontend. Uses a fresh
// browser profile and synthetic records; never opens the user's browser data.
import { chromium, expect } from '@playwright/test';

const url = process.env.TRACE_STARTUP_TEST_URL || 'http://127.0.0.1:5197';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1800, height: 1100 }, timezoneId: 'Asia/Bangkok' });
  const page = await context.newPage(), errors = [];
  // Guarantee that this smoke test cannot consume cloud inference allowance,
  // even if a separate local Worker starts while the test is running.
  await page.route('**/api/ai/**', route => route.abort('connectionrefused'));
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-13T05:00:00Z'));
  await page.goto(url);
  const nodes = page.locator('.react-flow__node');
  const create = async (kind, text, date) => {
    await page.getByRole('button', { name: 'Create node', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'New node', exact: true });
    await form.getByLabel('Type', { exact: true }).selectOption(kind);
    await form.getByLabel(kind, { exact: true }).fill(text); await form.getByLabel('Time', { exact: true }).fill(date);
    await page.keyboard.press('Enter'); await expect(form).not.toBeVisible();
  };
  await create('Action', 'A synthetic starting Action', '01/11/26'); await nodes.first().click();
  await create('Consequence', 'A synthetic Consequence', '05/11/26'); await nodes.nth(1).click();
  await create('Action', 'A synthetic follow-up', '13/11/26');
  await page.keyboard.press('Escape'); await create('Mistake', 'Forgot a meeting', '08/11/26');
  await page.keyboard.press('Escape'); await create('Mistake', 'Lost focus while reading', '09/11/26');
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByRole('list', { name: 'Measured reaction times', exact: true }).getByRole('button').click();
  await expect(page.locator('.reaction-total')).toHaveText('8 days');
  await page.getByRole('button', { name: 'Back to whiteboard', exact: true }).click();
  await page.getByRole('button', { name: 'Mistake overview', exact: true }).click();
  const overview = page.getByRole('dialog', { name: 'Mistake overview', exact: true });
  await expect(overview.getByRole('alert').first()).toContainText(/Cannot reach the AI service|unavailable/i);
  await overview.getByRole('button', { name: 'Close overview', exact: true }).click();
  await page.keyboard.press('Escape'); await create('Goal', 'The board remains usable after an AI failure', '13/11/26');
  await expect(page.getByRole('status', { name: 'All changes saved locally', exact: true })).toBeVisible();
  await page.reload(); await expect(nodes).toHaveCount(6);
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByRole('list', { name: 'Measured reaction times', exact: true }).getByRole('button').click();
  await expect(page.locator('.reaction-total')).toHaveText('8 days');
  expect(errors).toEqual([]);
  console.log('PASS: local cloud-mode startup, node/edge creation, reaction analysis, simulated unavailable AI, autosave and reload; no page errors or inference calls.');
} finally { await browser.close(); }
