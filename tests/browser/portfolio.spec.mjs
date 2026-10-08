import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const endpoint = 'https://portfolio-assistant.test.workers.dev/api/assistant';
const source = { id: 'profile', title: 'Public résumé', url: 'https://sarthak0501.github.io/resume/' };
const answer = { answer: 'Documented public experience. [profile]', evidence: [source], matches: [], unknowns: [] };
const response = (json, status = 200) => ({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(json) });

async function enabled(page, handler = route => route.fulfill(response(answer))) {
  await page.route('**/assistant-config.json', route => route.fulfill(response({ enabled: true, endpoint })));
  await page.route(endpoint, handler);
  await page.goto('/');
  await expect(page.locator('#assistant-status')).toContainText('Ready when you are');
}

async function ask(page, text) {
  await page.locator('#assistant-question').fill(text);
  await page.locator('#assistant-send').click();
  await expect(page.locator('#assistant-status')).toContainText('Answer ready');
}

for (const width of [320, 390, 768, 1440]) {
  test(`homepage ${width}px: central assistant, public access, no overflow, accessibility`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Sarthak Bichhawa');
    await expect(page.locator('#assistant-status')).toContainText('currently unavailable');
    await expect(page.locator('#assistant-send')).toBeDisabled();
    await expect(page.locator('#assistant-live')).toBeHidden();
    await expect(page.locator('.portfolio-brief')).toContainText('Curated public facts');
    await expect(page.locator('.brief-item')).toHaveCount(3);
    const positions = await page.evaluate(() => ({
      assistant: document.querySelector('#assistant').getBoundingClientRect().top,
      work: document.querySelector('#work').getBoundingClientRect().top,
      overflow: document.documentElement.scrollWidth > window.innerWidth
    }));
    expect(positions.overflow).toBe(false);
    expect(positions.assistant).toBeLessThan(positions.work);
    await expect(page.locator('.hero-copy a[href$=".pdf"]')).toBeVisible();
    await expect(page.locator('.hero-copy a[href^="mailto:"]')).toBeVisible();
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(a11y.violations).toEqual([]);
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: `artifacts/home-${width}.png`, fullPage: true });
  });
}

test('dark theme and reduced motion remain accessible', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/home-dark-mobile.png', fullPage: true });
});

test('sending is explicit; model and visitor HTML stay text; citations link public sources', async ({ page }) => {
  let requests = 0;
  await enabled(page, route => {
    requests += 1;
    return route.fulfill(response({ ...answer, answer: '<img src=x onerror=alert(1)> [profile]' }));
  });
  await page.getByRole('button', { name: /AI systems shipped/ }).click();
  expect(requests).toBe(0);
  await page.locator('#assistant-question').fill('<script>window.secret=true</script>');
  await page.locator('#assistant-send').click();
  await expect(page.locator('#assistant-status')).toContainText('Answer ready');
  expect(requests).toBe(1);
  await expect(page.locator('#assistant-conversation')).toContainText('<script>window.secret=true</script>');
  await expect(page.locator('#assistant-conversation')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#assistant-conversation script, #assistant-conversation img')).toHaveCount(0);
  await expect(page.locator('.assistant-citation')).toHaveAttribute('href', source.url);
  expect(await page.evaluate(() => window.secret)).toBeUndefined();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test('public job matching shows relevant evidence, gaps and unknowns', async ({ page }) => {
  let request;
  await enabled(page, route => {
    request = route.request().postDataJSON();
    return route.fulfill(response({ ...answer, matches: [
      { requirement: 'LLM agents', evidence: 'Public Azure OpenAI work [profile]', gap: 'Scope must be checked against the role.', sourceIds: ['profile'] },
      { requirement: 'PhD required', evidence: '', gap: 'A PhD is not established in the public record.', sourceIds: [] }
    ], unknowns: ['Kubernetes experience is not established.'] }));
  });
  await page.getByRole('button', { name: /Compare a role/ }).click();
  await expect(page.locator('#assistant-question')).toBeHidden();
  await page.locator('#assistant-job').fill('Public role: LLM agents, PhD, Kubernetes.');
  await page.locator('#assistant-send').click();
  await expect(page.locator('#assistant-status')).toContainText('Answer ready');
  expect(request).toMatchObject({ mode: 'match', question: '', jobDescription: 'Public role: LLM agents, PhD, Kubernetes.', context: [] });
  await expect(page.locator('.assistant-match')).toHaveCount(2);
  await expect(page.locator('.assistant-match-list')).toContainText('PhD is not established');
  await expect(page.locator('.assistant-unknowns')).toContainText('Kubernetes');
  const a11y = await new AxeBuilder({ page }).include('#assistant').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/assistant-role-comparison.png', fullPage: true });
});

test('only two previous questions are sent; eight requests cap and reset work', async ({ page }) => {
  const requests = [];
  await enabled(page, route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill(response(answer));
  });
  for (let index = 1; index <= 8; index++) {
    await page.locator('#assistant-question').fill(`Question ${index}`);
    await page.locator('#assistant-send').click();
    await expect(page.locator('.assistant-message--assistant')).toHaveCount(index);
  }
  expect(requests[3].context).toEqual(['Question 2', 'Question 3']);
  await expect(page.locator('#assistant-send')).toBeDisabled();
  await expect(page.locator('#assistant-status')).toContainText('eight requests');
  await page.locator('#assistant-clear').click();
  await expect(page.locator('#assistant-conversation')).toBeHidden();
  await expect(page.locator('#assistant-question')).toBeFocused();
  await ask(page, 'Fresh conversation');
  expect(requests.at(-1).context).toEqual([]);
});

for (const status of [429, 502, 503, 504]) {
  test(`HTTP ${status} preserves graceful public fallback and retry`, async ({ page }) => {
    let calls = 0;
    await enabled(page, route => route.fulfill(calls++ === 0
      ? response({ error: { message: 'SENSITIVE_UPSTREAM_DETAILS' } }, status) : response(answer)));
    await page.locator('#assistant-question').fill('A public question');
    await page.locator('#assistant-send').click();
    await expect(page.locator('.assistant-message--error')).toBeVisible();
    await expect(page.locator('.assistant-fallback a').first()).toHaveAttribute('href', '/case/');
    await expect(page.locator('#assistant-conversation')).not.toContainText('SENSITIVE_UPSTREAM_DETAILS');
    await expect(page.locator('#assistant-send')).toBeEnabled();
    await page.locator('#assistant-send').click();
    await expect(page.locator('#assistant-status')).toContainText('Answer ready');
  });
}

test('unsafe source URLs fail closed', async ({ page }) => {
  await enabled(page, route => route.fulfill(response({ ...answer, evidence: [{ ...source, url: 'javascript:alert(1)' }] })));
  await page.locator('#assistant-question').fill('A public question');
  await page.locator('#assistant-send').click();
  await expect(page.locator('.assistant-message--error')).toBeVisible();
  await expect(page.locator('.assistant-message--assistant')).toHaveCount(0);
});

test('cancel and clear do not render a stale delayed answer', async ({ page }) => {
  await enabled(page, async route => {
    await new Promise(resolve => setTimeout(resolve, 400));
    await route.fulfill(response(answer)).catch(() => {});
  });
  await page.locator('#assistant-question').fill('Delayed question');
  await page.locator('#assistant-send').click();
  await page.locator('#assistant-cancel').click();
  await expect(page.locator('#assistant-status')).toContainText('Request stopped');
  await page.locator('#assistant-clear').click();
  await expect(page.locator('#assistant-welcome')).toBeVisible();
  await expect(page.locator('.assistant-message--assistant')).toHaveCount(0);
});

test('request timeout recovers controls', async ({ page }) => {
  await page.clock.install();
  await enabled(page, () => {});
  await page.locator('#assistant-question').fill('Timeout question');
  await page.locator('#assistant-send').click();
  await page.clock.fastForward(36000);
  await expect(page.locator('#assistant-status')).toContainText('took too long');
  await expect(page.locator('#assistant-send')).toBeEnabled();
});

test('keyboard entry and JavaScript-free public content remain usable', async ({ page, browser }) => {
  await enabled(page);
  await page.getByRole('button', { name: /AI systems shipped/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#assistant-question')).toBeFocused();
  await page.locator('#assistant-send').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#assistant-status')).toContainText('Answer ready');
  const context = await browser.newContext({ javaScriptEnabled: false });
  const plain = await context.newPage();
  await plain.goto('http://127.0.0.1:8081/');
  await expect(plain.locator('.assistant-no-script')).toContainText('needs JavaScript');
  await expect(plain.locator('.hero-copy a[href$=".pdf"]')).toBeVisible();
  await expect(plain.locator('#work')).toContainText('Selected work');
  await context.close();
});

const publicRoutes = [
  '/case/', '/case/incident-agent/', '/case/customer-health-agent/',
  '/case/revenue-attribution/', '/case/data-trust/', '/case/account2vec/',
  '/case/stress-lab/', '/resume/', '/writing/',
  '/writing/shipping-genai-enterprise.html', '/writing/account2vec-platform.html',
  '/colophon/', '/receipts/'
];
for (const width of [390, 1440]) {
  test(`public pages ${width}px: readable layout, working navigation, accessibility`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    for (const path of publicRoutes) {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect.soft(a11y.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, reason: n.failureSummary })) })), path).toEqual([]);
      if (['/case/', '/resume/', '/case/incident-agent/'].includes(path)) {
        await page.screenshot({ path: `artifacts/page-${path.replaceAll('/', '-').replace(/^-|-$/g, '')}-${width}.png`, fullPage: true });
      }
    }
  });
}

test('mobile navigation and curated evidence links resolve', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.nav-resume')).toBeVisible();
  const evidence = await page.locator('.brief-item').evaluateAll(links => links.map(link => link.getAttribute('href')));
  for (const href of evidence) {
    await page.goto(href);
    const hash = new URL(page.url()).hash;
    if (hash) await expect(page.locator(hash)).toBeVisible();
  }
  await page.locator('#navMenu summary').click();
  await expect(page.locator('#navMenu')).toBeVisible();
  await page.locator('#navMenu').getByRole('link', { name: 'Work', exact: true }).click();
  await expect(page).toHaveURL(/\/case\/$/);
});

test('mobile live advocate and dark role results remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await enabled(page, route => route.fulfill(response({ ...answer,
    matches: [{ requirement: 'LLM agents', evidence: 'Documented production work [profile]', gap: 'Team scope needs a conversation.', sourceIds: ['profile'] }],
    unknowns: ['Availability is not established by these sources.']
  })));
  await page.getByRole('button', { name: /Compare a role/ }).click();
  await page.locator('#assistant-job').fill('Public role requiring production AI systems and technical leadership.');
  await page.locator('#assistant-send').click();
  await expect(page.locator('#assistant-status')).toContainText('Answer ready');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/assistant-dark-mobile-result.png', fullPage: true });
});
