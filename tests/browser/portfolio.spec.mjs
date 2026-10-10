import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const endpoint = 'https://portfolio-assistant.test.workers.dev/api/assistant';
const resumePath = '/resumes/SarthakBichhawa_Resume_2026.pdf';
const source = { id: 'profile', title: 'Public résumé', url: 'https://sarthak0501.github.io/resume/' };
const answer = { answer: 'Documented public experience. [profile]', evidence: [source], matches: [], unknowns: [] };
const response = (json, status = 200) => ({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(json) });

test.beforeEach(async ({ context, page }) => {
  // Never use the published service from UI tests, even after production activation.
  // Explicit page-level mock handlers in enabled() take precedence over this guard.
  await context.route(/\/api\/assistant(?:[?#]|$)/, route => route.abort('blockedbyclient'));
  await page.route('**/assistant-config.json', route => route.fulfill(response({ enabled: false, endpoint: '' })));
});

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
    await expect(page.locator('#assistant-live')).toBeVisible();
    await expect(page.locator('#assistant-question')).toBeVisible();
    await expect(page.locator('#assistant-question')).toBeEnabled();
    expect(await page.locator('#assistant-question').evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(900);
    await expect(page.locator('[data-guide]')).toHaveCount(3);
    await expect(page.locator('#guide-answer')).toBeHidden();
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

test('the site stays light under a dark OS preference and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const palette = () => page.evaluate(() => ({
    scheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
  }));
  const darkPreference = await palette();
  expect(darkPreference.scheme).toBe('light');
  // Check the rendered canvas, so removing the media query without providing a
  // light page background cannot silently regress to a browser-default dark UI.
  expect(darkPreference.background).toMatch(/^rgb\(/);
  expect(darkPreference.background.match(/\d+/g).map(Number).every(channel => channel >= 235)).toBe(true);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  expect(await palette()).toEqual(darkPreference);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
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
  await expect(page.locator('#assistant-input-note')).toBeVisible();
  await expect(page.locator('#assistant-input-note')).toContainText('Sent to OpenAI when you send.');
  await page.locator('[data-guide="ai"]').click();
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
  await expect(page.locator('#assistant-input-note')).toBeVisible();
  await expect(page.locator('#assistant-input-note')).toContainText('Sent to OpenAI when you send.');
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

for (const width of [390, 1440]) {
  test(`waiting indicator ${width}px: pending feedback, motion preference and success cleanup`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let pendingRoute;
    await enabled(page, route => { pendingRoute = route; });
    const thinking = page.locator('#assistant-thinking');
    await expect(thinking).toBeHidden();

    for (const mode of ['question', 'match']) {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      if (mode === 'match') await page.getByRole('button', { name: /Compare a role/ }).click();
      await page.locator(mode === 'match' ? '#assistant-job' : '#assistant-question').fill(
        mode === 'match' ? 'Public role requiring AI product leadership.' : 'What is the strongest case for Sarthak?'
      );
      pendingRoute = undefined;
      await page.locator('#assistant-send').click();
      await expect.poll(() => Boolean(pendingRoute)).toBe(true);
      await expect(thinking).toBeVisible();
      await expect(thinking).toHaveAttribute('aria-hidden', 'true');
      await expect(thinking).toContainText(mode === 'match' ? 'Comparing the role' : 'Thinking');
      await expect(thinking.locator('.assistant-thinking-dot')).toHaveCount(3);
      expect(await thinking.locator('.assistant-thinking-dot').evaluateAll(dots =>
        dots.every(dot => getComputedStyle(dot).animationName !== 'none'
          && dot.getAnimations().some(animation => animation.playState === 'running'))
      )).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const a11y = await new AxeBuilder({ page }).include('#assistant').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(a11y.violations).toEqual([]);
      await page.screenshot({ path: `artifacts/assistant-waiting-${mode}-${width}.png`, fullPage: true });

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(thinking).toBeVisible();
      expect(await thinking.locator('.assistant-thinking-dot').evaluateAll(dots =>
        dots.every(dot => getComputedStyle(dot).animationName === 'none')
      )).toBe(true);
      await pendingRoute.fulfill(response(answer));
      await expect(page.locator('#assistant-status')).toContainText('Answer ready');
      await expect(thinking).toBeHidden();
    }
  });
}

for (const width of [390, 1440]) {
  test(`long role replies ${width}px: each new answer opens at its heading`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let replies = 0;
    await enabled(page, route => route.fulfill(response({
      ...answer,
      answer: `Comparison ${++replies}. Here is the documented public experience. [profile]`,
      matches: Array.from({ length: 8 }, (_, index) => ({
        requirement: `Public role requirement ${index + 1}`,
        evidence: 'Documented work supports part of this requirement. The public sources describe the experience and its scope. [profile]',
        gap: 'The public record does not establish every responsibility in this role. Confirm the remaining scope in a conversation.',
        sourceIds: ['profile'],
      })),
    })));
    await page.getByRole('button', { name: /Compare a role/ }).click();

    for (let turn = 1; turn <= 2; turn++) {
      await page.locator('#assistant-job').fill(`Public AI leadership role ${turn}.`);
      await page.locator('#assistant-send').click();
      await expect(page.locator('.assistant-message--assistant')).toHaveCount(turn);
      await expect(page.locator('#assistant-status')).toContainText('Answer ready');
      const latest = page.locator('.assistant-message--assistant').last();
      await expect(latest.locator('.assistant-message-body')).toContainText(`Comparison ${turn}.`);

      // toBeVisible alone does not detect content clipped by the conversation scroller.
      const position = await latest.evaluate(message => {
        const conversation = message.closest('#assistant-conversation');
        const viewport = conversation.getBoundingClientRect();
        const heading = message.querySelector('.assistant-message-label').getBoundingClientRect();
        const opening = message.querySelector('.assistant-message-body').getBoundingClientRect();
        return {
          viewportTop: viewport.top,
          viewportBottom: viewport.bottom,
          viewportHeight: conversation.clientHeight,
          messageHeight: message.getBoundingClientRect().height,
          headingTop: heading.top,
          openingBottom: opening.bottom,
        };
      });
      expect(position.messageHeight).toBeGreaterThan(position.viewportHeight * 2);
      expect(position.headingTop).toBeGreaterThanOrEqual(position.viewportTop - 1);
      expect(position.openingBottom).toBeLessThanOrEqual(position.viewportBottom + 1);
    }
  });
}

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
    await expect(page.locator('#assistant-thinking')).toBeHidden();
    await expect(page.locator('.assistant-fallback a').first()).toHaveAttribute('href', '/case/');
    await expect(page.locator('#assistant-conversation')).not.toContainText('SENSITIVE_UPSTREAM_DETAILS');
    await expect(page.locator('#assistant-send')).toBeEnabled();
    await page.locator('#assistant-send').click();
    await expect(page.locator('#assistant-status')).toContainText('Answer ready');
    await expect(page.locator('#assistant-thinking')).toBeHidden();
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
  let pendingRoute;
  await enabled(page, route => { pendingRoute = route; });
  for (const action of ['cancel', 'clear']) {
    pendingRoute = undefined;
    await page.locator('#assistant-question').fill('Delayed question');
    await page.locator('#assistant-send').click();
    await expect.poll(() => Boolean(pendingRoute)).toBe(true);
    await expect(page.locator('#assistant-thinking')).toBeVisible();
    await page.locator(`#assistant-${action}`).click();
    if (action === 'cancel') {
      await expect(page.locator('#assistant-status')).toContainText('Request stopped');
      await expect(page.locator('#assistant-thinking')).toBeHidden();
      await page.locator('#assistant-clear').click();
    }
    await expect(page.locator('#assistant-thinking')).toBeHidden();
    await pendingRoute.fulfill(response(answer)).catch(() => {});
    await expect(page.locator('#assistant-welcome')).toBeVisible();
    await expect(page.locator('.assistant-message--assistant')).toHaveCount(0);
    await expect(page.locator('#assistant-thinking')).toBeHidden();
  }
});

test('request timeout recovers controls', async ({ page }) => {
  await page.clock.install();
  await enabled(page, () => {});
  await page.locator('#assistant-question').fill('Timeout question');
  await page.locator('#assistant-send').click();
  await expect(page.locator('#assistant-thinking')).toBeVisible();
  await page.clock.fastForward(36000);
  await expect(page.locator('#assistant-status')).toContainText('took too long');
  await expect(page.locator('#assistant-thinking')).toBeHidden();
  await expect(page.locator('#assistant-send')).toBeEnabled();
});

test('keyboard entry and JavaScript-free public content remain usable', async ({ page, browser }) => {
  await enabled(page);
  await page.locator('[data-guide="ai"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#guide-ai')).toBeVisible();
  await page.locator('#assistant-question').fill('Give me the strongest case for Sarthak.');
  await page.locator('#assistant-question').press('Control+Enter');
  await expect(page.locator('#assistant-status')).toContainText('Answer ready');
  const context = await browser.newContext({ javaScriptEnabled: false });
  const plain = await context.newPage();
  await plain.goto('http://127.0.0.1:8081/');
  await expect(plain.locator('.assistant-no-script')).toContainText('needs JavaScript');
  await expect(plain.locator('.hero-copy a[href$=".pdf"]')).toBeVisible();
  await expect(plain.locator('#work')).toContainText('Selected work');
  await expect(plain.locator('.work-diagram-scene[role="img"]:visible')).toHaveCount(3);
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
    const resumeLinks = new Set();
    for (const path of ['/', ...publicRoutes]) {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      const pdfLinks = await page.locator('a[href]').evaluateAll(links => links
        .map(link => new URL(link.href))
        .filter(url => url.origin === location.origin && url.pathname.endsWith('.pdf'))
        .map(url => url.pathname));
      expect(pdfLinks.length, `${path} offers the shared résumé`).toBeGreaterThan(0);
      for (const pdfPath of pdfLinks) resumeLinks.add(pdfPath);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect.soft(a11y.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, reason: n.failureSummary })) })), path).toEqual([]);
      if (['/case/', '/resume/', '/case/incident-agent/'].includes(path)) {
        await page.screenshot({ path: `artifacts/page-${path.replaceAll('/', '-').replace(/^-|-$/g, '')}-${width}.png`, fullPage: true });
      }
    }
    expect([...resumeLinks]).toEqual([resumePath]);
    const resume = await page.request.get(resumePath);
    expect(resume.ok()).toBe(true);
    expect((await resume.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });
}

test('mobile navigation and curated evidence links resolve', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.nav-resume')).toBeVisible();
  const evidence = await page.locator('.guide-sources a').evaluateAll(links => links.map(link => link.getAttribute('href')));
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

test('mobile live answers remain accessible under a dark OS preference', async ({ page }) => {
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


test('typing remains available offline; guided answers preserve drafts and never call the model', async ({ page }) => {
  let modelCalls = 0;
  await page.route(endpoint, route => { modelCalls++; return route.fulfill(response(answer)); });
  await page.goto('/');
  await expect(page.locator('#assistant-status')).toContainText('currently unavailable');
  await page.locator('#assistant-question').fill('How would his experience help my team?');
  await expect(page.locator('#assistant-send')).toBeDisabled();
  for (const id of ['why', 'ai', 'leadership']) {
    await page.locator(`[data-guide="${id}"]`).click();
    await expect(page.locator(`[data-guide-panel="${id}"]`)).toBeVisible();
    await expect(page.locator('[data-guide-panel]:visible')).toHaveCount(1);
    await expect(page.locator('.guide-answer-head')).toContainText('Curated public answer');
    await expect(page.locator('#assistant-question')).toHaveValue('How would his experience help my team?');
  }
  await page.locator('#guide-close').click();
  await expect(page.locator('#guide-answer')).toBeHidden();
  await expect(page.locator('[data-guide="leadership"]')).toBeFocused();
  await page.getByRole('button', { name: 'Compare a role', exact: true }).click();
  await page.locator('#assistant-job').fill('A public AI leadership role.');
  await page.getByRole('button', { name: 'Ask a question', exact: true }).click();
  await expect(page.locator('#assistant-question')).toHaveValue('How would his experience help my team?');
  expect(modelCalls).toBe(0);
  await expect(page.locator('.assistant-message--assistant')).toHaveCount(0);
});

for (const width of [320, 390, 1440]) {
  test(`guided answers and project showcase ${width}px: progressive disclosure and keyboard navigation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const id of ['why', 'ai', 'leadership']) {
      await page.locator(`[data-guide="${id}"]`).click();
      const a11y = await new AxeBuilder({ page }).include('#assistant').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(a11y.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: `artifacts/guide-open-${width}.png`, fullPage: true });
    const tabs = page.locator('[data-work-tab]');
    await expect(tabs).toHaveCount(3);
    const diagramNames = ['Investigate, then conclude.', 'One question. A connected picture.', 'Recover. Attribute. Reconcile.'];
    const diagramDescriptions = [/incident.*hypotheses/i, /customer.*13 metric domains/i, /revenue.*reconciliation.*Finance/i];
    for (let i = 0; i < 3; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('[data-work-panel]:visible')).toHaveCount(1);
      const panel = page.locator('[data-work-panel]:visible');
      const diagram = panel.locator('.work-diagram-scene');
      await expect(diagram).toHaveAttribute('role', 'img');
      await expect(diagram).toHaveAccessibleName(diagramNames[i]);
      await expect(diagram).toHaveAccessibleDescription(diagramDescriptions[i]);
      await expect(panel.locator('figcaption')).toContainText('Illustrative system diagram');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const a11y = await new AxeBuilder({ page }).include('#work').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(a11y.violations).toEqual([]);
      await panel.screenshot({ path: `artifacts/project-${await tabs.nth(i).getAttribute('data-work-tab')}-${width}.png` });
    }
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(tabs.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tabs.first()).toBeFocused();
  });
}
