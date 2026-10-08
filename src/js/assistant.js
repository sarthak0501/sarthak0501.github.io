/* Public portfolio assistant. No HTML from the model is interpreted or stored. */
(() => {
  'use strict';

  const root = document.querySelector('[data-portfolio-assistant]');
  if (!root) return;

  const MAX_TURNS = 8;
  const REQUEST_TIMEOUT = 35000;
  const UNAVAILABLE = 'Live AI is currently unavailable.';
  const elements = {
    form: root.querySelector('#assistant-form'),
    live: root.querySelector('#assistant-live'),
    question: root.querySelector('#assistant-question'),
    job: root.querySelector('#assistant-job'),
    questionField: root.querySelector('#assistant-question-field'),
    matchField: root.querySelector('#assistant-match-field'),
    suggestions: root.querySelector('#assistant-suggestions'),
    counter: root.querySelector('#assistant-counter'),
    note: root.querySelector('#assistant-input-note'),
    status: root.querySelector('#assistant-status'),
    send: root.querySelector('#assistant-send'),
    sendLabel: root.querySelector('#assistant-send-label'),
    cancel: root.querySelector('#assistant-cancel'),
    clear: root.querySelector('#assistant-clear'),
    welcome: root.querySelector('#assistant-welcome'),
    conversation: root.querySelector('#assistant-conversation'),
  };
  const modeButtons = [...root.querySelectorAll('[data-assistant-mode]')];
  const guideButtons = [...root.querySelectorAll('[data-guide]')];
  const guidePanels = [...root.querySelectorAll('[data-guide-panel]')];
  const guideAnswer = root.querySelector('#guide-answer');
  const guideClose = root.querySelector('#guide-close');
  let currentGuide = null;
  const canonicalOrigin = new URL(root.dataset.siteUrl).origin;
  let mode = 'question';
  let endpoint = '';
  let available = false;
  let checking = true;
  let turns = 0;
  let questions = [];
  let pending = null;
  let sequence = 0;

  function make(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function setStatus(message, state = '') {
    elements.status.textContent = message;
    elements.status.dataset.state = state;
  }

  function currentInput() {
    return mode === 'match' ? elements.job : elements.question;
  }

  function refreshControls() {
    const busy = Boolean(pending);
    const input = currentInput();
    const limit = mode === 'match' ? 6000 : 1200;
    elements.counter.textContent = `${input.value.length.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')}`;
    elements.send.disabled = checking || !available || busy || turns >= MAX_TURNS || !input.value.trim();
    elements.cancel.hidden = !busy;
    elements.clear.disabled = turns === 0 && !elements.conversation.childElementCount && !elements.question.value && !elements.job.value;
    elements.question.disabled = busy || mode !== 'question';
    elements.job.disabled = busy || mode !== 'match';
    modeButtons.forEach((button) => { button.disabled = busy; });
    elements.conversation.setAttribute('aria-busy', String(busy));
  }

  function readyStatus() {
    if (checking) return setStatus('Checking availability…');
    if (!available) return setStatus(`${UNAVAILABLE} The guided answers below are ready to explore.`);
    if (turns >= MAX_TURNS) return setStatus('This conversation has reached eight requests. Clear it to start a new conversation.');
    if (turns) return setStatus(`${MAX_TURNS - turns} requests left in this conversation.`);
    setStatus('Ready when you are. No text is sent until you send.');
  }

  function setMode(nextMode, focus = false) {
    if (pending || !['question', 'match'].includes(nextMode)) return;
    mode = nextMode;
    const matching = mode === 'match';
    elements.questionField.hidden = matching;
    elements.matchField.hidden = !matching;
    elements.suggestions.hidden = false;
    elements.question.required = !matching;
    elements.job.required = matching;
    elements.sendLabel.textContent = matching ? 'Compare public experience' : 'Ask the assistant';
    elements.note.textContent = matching ? 'Public descriptions only. Sent to OpenAI when you send.' : 'Public questions only. Sent to OpenAI when you send.';
    modeButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.assistantMode === mode));
    });
    refreshControls();
    if (focus) currentInput().focus();
  }

  function safeEvidence(raw) {
    if (!raw || typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id)
      || typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 180
      || typeof raw.url !== 'string' || raw.url.length > 500) return null;
    try {
      const url = new URL(raw.url, canonicalOrigin);
      const allowedPath = /^\/(?:case\/|resume(?:\/|$)|writing\/|receipts(?:\/|$)|resumes\/[a-zA-Z0-9_-]+\.pdf$)/.test(url.pathname);
      if (url.origin !== canonicalOrigin || url.protocol !== 'https:' || url.username || url.password || url.search || !allowedPath) return null;
      return { id: raw.id, title: raw.title, url: url.href };
    } catch {
      return null;
    }
  }

  function evidenceLink(source, className = '') {
    const link = make('a', className, source.title);
    link.href = source.url;
    return link;
  }

  function appendCitedText(node, value, sourceMap) {
    const citations = /\[([a-zA-Z0-9_-]{1,80})\]/g;
    let offset = 0;
    for (const match of value.matchAll(citations)) {
      node.append(document.createTextNode(value.slice(offset, match.index)));
      const source = sourceMap.get(match[1]);
      if (source) {
        const link = evidenceLink(source, 'assistant-citation');
        link.textContent = `[${source.title}]`;
        node.append(link);
      } else {
        node.append(document.createTextNode(match[0]));
      }
      offset = match.index + match[0].length;
    }
    node.append(document.createTextNode(value.slice(offset)));
  }

  function appendSources(node, sources) {
    if (!sources.length) return;
    const group = make('div', 'assistant-evidence');
    group.append(make('span', '', 'Sources'));
    sources.forEach((source) => group.append(evidenceLink(source)));
    node.append(group);
  }

  function addMessage(kind, label) {
    elements.welcome.hidden = true;
    elements.conversation.hidden = false;
    const message = make('article', `assistant-message assistant-message--${kind}`);
    message.append(make('h3', 'assistant-message-label', label));
    elements.conversation.append(message);
    return message;
  }

  function scrollToLatest() {
    elements.conversation.scrollTop = elements.conversation.scrollHeight;
  }

  function renderResponse(data) {
    if (!data || typeof data.answer !== 'string' || !data.answer.trim() || data.answer.length > 14000
      || !Array.isArray(data.evidence) || data.evidence.length > 24
      || !Array.isArray(data.matches) || data.matches.length > 12
      || !Array.isArray(data.unknowns) || data.unknowns.length > 12) throw new Error('invalid_response');
    const sources = data.evidence.map(safeEvidence).filter(Boolean);
    // A response with unsafe evidence is not allowed to look like a sourced answer.
    if (sources.length !== data.evidence.length || new Set(sources.map((source) => source.id)).size !== sources.length) throw new Error('invalid_response');
    const sourceMap = new Map(sources.map((source) => [source.id, source]));
    for (const match of data.matches) {
      if (!match || ['requirement', 'evidence', 'gap'].some((key) => typeof match[key] !== 'string' || match[key].length > 4000)
        || !Array.isArray(match.sourceIds) || match.sourceIds.length > 12
        || match.sourceIds.some((id) => typeof id !== 'string' || !sourceMap.has(id))) throw new Error('invalid_response');
    }
    if (data.unknowns.some((value) => typeof value !== 'string' || value.length > 1500)) throw new Error('invalid_response');

    const message = addMessage('assistant', 'AI portfolio assistant');
    const answer = make('p', 'assistant-message-body');
    appendCitedText(answer, data.answer, sourceMap);
    message.append(answer);
    if (data.matches.length) {
      const comparisons = make('div', 'assistant-match-list');
      data.matches.forEach((match) => {
        const row = make('section', 'assistant-match');
        row.append(make('h4', '', match.requirement));
        const evidence = make('p');
        evidence.append(make('strong', '', 'Relevant experience: '));
        appendCitedText(evidence, match.evidence || 'Not established in the public record.', sourceMap);
        row.append(evidence);
        const gap = make('p');
        gap.append(make('strong', '', 'Gap / limit: '));
        appendCitedText(gap, match.gap || 'No additional gap identified in the supplied public requirements.', sourceMap);
        row.append(gap);
        appendSources(row, [...new Set(match.sourceIds)].map((id) => sourceMap.get(id)));
        comparisons.append(row);
      });
      message.append(comparisons);
    }
    if (data.unknowns.length) {
      const unknowns = make('section', 'assistant-unknowns');
      unknowns.append(make('h4', '', 'What the public record does not establish'));
      const list = make('ul');
      data.unknowns.forEach((value) => list.append(make('li', '', value)));
      unknowns.append(list);
      message.append(unknowns);
    }
    appendSources(message, sources);
    scrollToLatest();
  }

  function renderFailure(message) {
    const article = addMessage('error', 'Assistant status');
    article.append(make('p', '', message));
    const links = make('div', 'assistant-fallback');
    const work = make('a', '', 'Explore the case studies ↗');
    work.href = '/case/';
    const contact = make('a', '', 'Contact Sarthak ↗');
    contact.href = '/#contact';
    links.append(work, contact);
    article.append(links);
    scrollToLatest();
  }

  function failureText(status) {
    if (status === 429) return 'The assistant has reached its request limit. Please try again later, or explore the sources directly.';
    if (status === 504) return 'The assistant took too long to reply. Please try again with a shorter question.';
    if ([400, 413].includes(status)) return 'That request could not be processed. Use a question under 1,200 characters or a public job description under 6,000 characters.';
    return UNAVAILABLE;
  }

  async function send(event) {
    event.preventDefault();
    if (checking || !available || pending || turns >= MAX_TURNS) return;
    const input = currentInput();
    const value = input.value.trim();
    const limit = mode === 'match' ? 6000 : 1200;
    if (!value || value.length > limit) {
      setStatus(`Enter ${mode === 'match' ? 'a public job description' : 'a question'} under ${limit.toLocaleString('en-US')} characters.`, 'error');
      input.focus();
      return;
    }

    const requestMode = mode;
    const controller = new AbortController();
    const requestId = ++sequence;
    pending = { controller, reason: '', id: requestId };
    turns += 1;
    const visitor = addMessage('visitor', requestMode === 'match' ? 'You · public role comparison' : 'You');
    visitor.append(make('p', 'assistant-message-body', value));
    setStatus(requestMode === 'match' ? 'Comparing the public requirements with the documented experience…' : 'Checking the public record and its sources…');
    refreshControls();
    scrollToLatest();
    const timeout = window.setTimeout(() => {
      if (pending?.id === requestId) {
        pending.reason = 'timeout';
        controller.abort();
      }
    }, REQUEST_TIMEOUT);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: requestMode,
          question: requestMode === 'question' ? value : '',
          jobDescription: requestMode === 'match' ? value : '',
          context: questions.slice(-2),
        }),
        signal: controller.signal,
      });
      if (pending?.id !== requestId) return;
      if (!response.ok) {
        const failure = new Error('request_failed');
        failure.status = response.status;
        throw failure;
      }
      const contentType = response.headers.get('Content-Type') || '';
      if (!contentType.includes('application/json')) throw new Error('invalid_response');
      const body = await response.text();
      if (pending?.id !== requestId) return;
      if (body.length > 80000) throw new Error('invalid_response');
      renderResponse(JSON.parse(body));
      if (requestMode === 'question') questions = [...questions.slice(-1), value];
      input.value = '';
      setStatus(`Answer ready. Check the linked sources. ${MAX_TURNS - turns} requests left.`);
    } catch (error) {
      if (pending?.id !== requestId) return;
      const canceled = pending.reason === 'user';
      const timedOut = pending.reason === 'timeout';
      const message = canceled ? 'Request stopped. The server may already have processed it.'
        : timedOut ? 'The assistant took too long to reply. Please try again with a shorter question.'
          : failureText(error.status);
      renderFailure(message);
      setStatus(message, canceled ? '' : 'error');
    } finally {
      window.clearTimeout(timeout);
      if (pending?.id === requestId) {
        pending = null;
        refreshControls();
        if (turns >= MAX_TURNS) readyStatus();
      }
    }
  }

  async function loadConfig() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch('/assistant-config.json', { credentials: 'omit', cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const config = await response.json();
      if (config?.enabled !== true || typeof config.endpoint !== 'string' || !config.endpoint.trim()) return;
      const url = new URL(config.endpoint);
      const localEndpoint = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      const localPage = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
      if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && localEndpoint && localPage))) return;
      endpoint = url.href;
      available = true;
    } catch {
      available = false;
    } finally {
      window.clearTimeout(timeout);
      checking = false;
      root.dataset.availability = available ? 'ready' : 'unavailable';
      elements.live.hidden = false;
      readyStatus();
      refreshControls();
    }
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.assistantMode)));
  function selectGuide(id) {
    currentGuide = id;
    guideAnswer.hidden = !id;
    guidePanels.forEach((panel) => { panel.hidden = panel.dataset.guidePanel !== id; });
    guideButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.guide === id)));
  }
  guideButtons.forEach((button) => button.addEventListener('click', () => {
    selectGuide(currentGuide === button.dataset.guide ? null : button.dataset.guide);
  }));
  guideClose.addEventListener('click', () => {
    const previous = currentGuide;
    selectGuide(null);
    guideButtons.find((button) => button.dataset.guide === previous)?.focus();
  });
  [elements.question, elements.job].forEach((input) => input.addEventListener('input', refreshControls));
  elements.form.addEventListener('submit', send);
  [elements.question, elements.job].forEach((input) => input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) {
      event.preventDefault();
      if (!elements.send.disabled) elements.form.requestSubmit();
    }
  }));
  elements.cancel.addEventListener('click', () => {
    if (!pending) return;
    pending.reason = 'user';
    pending.controller.abort();
  });
  elements.clear.addEventListener('click', () => {
    sequence += 1;
    pending?.controller.abort();
    pending = null;
    turns = 0;
    questions = [];
    elements.conversation.replaceChildren();
    elements.conversation.hidden = true;
    elements.welcome.hidden = false;
    selectGuide(null);
    elements.question.value = '';
    elements.job.value = '';
    readyStatus();
    setMode('question', true);
  });
  setMode('question');
  loadConfig();
})();
