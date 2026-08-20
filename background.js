import {DEFAULTS, DEFAULT_ACTIONS, enabledActions, getSettings} from './shared.js';

const PROVIDER_NAMES = {
  ollama: 'Ollama', groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter',
  cerebras: 'Cerebras', openai: 'OpenAI', vercel: 'Vercel AI Gateway',
};

let menuBuild = Promise.resolve();

browser.runtime.onInstalled.addListener(() => {
  initializeExtension().catch(error => {
    console.error('Could not initialize PromptPaste:', error);
  });
});

async function initializeExtension() {
  await removeLegacyPageControls();
  const current = await browser.storage.local.get(null);
  if (!Object.keys(current).length) {
    await browser.storage.local.set({...DEFAULTS, defaultActionsSeeded: true});
  } else if (!current.defaultActionsSeeded) {
    const actions = Array.isArray(current.customActions) ? current.customActions : [];
    const actionIds = new Set(actions.map(action => action.id));
    await browser.storage.local.set({
      customActions: [
        ...actions,
        ...DEFAULT_ACTIONS.filter(action => !actionIds.has(action.id)),
      ],
      defaultActionsSeeded: true,
    });
  }
  scheduleMenuRebuild();
}

async function removeLegacyPageControls() {
  const tabs = await browser.tabs.query({});
  await Promise.allSettled(tabs
    .filter(tab => tab.id)
    .map(tab => browser.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => {
        document.getElementById('promptpaste-trigger')?.remove();
        document.getElementById('promptpaste-host')?.remove();
        document.getElementById('promptpaste-toast')?.remove();
      },
    })));
}

browser.storage.onChanged.addListener((_changes, area) => {
  if (area !== 'local') return;
  scheduleMenuRebuild();
  broadcastPageConfig().catch(error => console.error('Could not update page controls:', error));
});

async function broadcastPageConfig() {
  const settings = await getSettings();
  const tabs = await browser.tabs.query({});
  await Promise.allSettled(tabs
    .filter(tab => tab.id)
    .map(tab => browser.tabs.sendMessage(tab.id, {
      type: 'SET_PAGE_CONFIG',
      customActions: settings.customActions,
      selectionTrigger: settings.selectionTrigger,
    })));
}

function scheduleMenuRebuild() {
  menuBuild = menuBuild.then(rebuildMenus).catch(error => console.error('Could not rebuild PromptPaste menus:', error));
  return menuBuild;
}

async function rebuildMenus() {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({id: 'promptpaste-root', title: 'PromptPaste', contexts: ['selection', 'editable']});
  browser.contextMenus.create({id: 'correct', parentId: 'promptpaste-root', title: 'Correct selected text', contexts: ['selection', 'editable']});
  browser.contextMenus.create({id: 'rewrite', parentId: 'promptpaste-root', title: 'Rewrite selected text', contexts: ['selection', 'editable']});
  browser.contextMenus.create({id: 'prompt', parentId: 'promptpaste-root', title: 'Run selected prompt', contexts: ['selection', 'editable']});
  const settings = await getSettings();
  for (const action of enabledActions(settings)) {
    browser.contextMenus.create({id: `custom:${action.id}`, parentId: 'promptpaste-root', title: action.name, contexts: ['selection', 'editable']});
  }
}

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'promptpaste-root') return;
  const action = info.menuItemId.startsWith('custom:')
    ? {mode: 'custom', actionId: info.menuItemId.slice(7)}
    : {mode: info.menuItemId};
  runOnTab(tab.id, action, info.selectionText || '').catch(error => showError(tab.id, error));
});

browser.commands.onCommand.addListener(command => {
  runCommand(command).catch(error => console.error('Could not run PromptPaste command:', error));
});

async function runCommand(command) {
  const [tab] = await browser.tabs.query({active: true, currentWindow: true});
  if (!tab?.id) return;
  try {
    await runOnTab(tab.id, {mode: command === 'run-prompt' ? 'prompt' : command});
  } catch (error) {
    await showError(tab.id, error);
  }
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'RUN_ACTION') {
    return handleActionRequest(message.tabId, message.action);
  }
  if (message.type === 'RUN_ACTION_FROM_PAGE') {
    const tabId = sender.tab?.id;
    return handleActionRequest(tabId, message.action, message.text || '');
  }
  return false;
});

async function handleActionRequest(tabId, action, fallbackText = '') {
  try {
    await runOnTab(tabId, action, fallbackText);
    return {ok: true};
  } catch (error) {
    await showError(tabId, error);
    return {ok: false, error: error.message || String(error)};
  }
}

async function ensureContent(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, {type: 'PING'});
  } catch {
    await browser.scripting.executeScript({target: {tabId}, files: ['page-controller.js']});
  }
}

async function runOnTab(tabId, actionRequest, fallbackText = '') {
  if (!tabId) throw new Error('No active tab.');
  await ensureContent(tabId);
  const capture = await browser.tabs.sendMessage(tabId, {type: 'CAPTURE_SELECTION'});
  const text = capture?.text || fallbackText;
  if (!text?.trim()) throw new Error('Select text first.');
  await browser.tabs.sendMessage(tabId, {type: 'WORKING'});
  const settings = await getSettings();
  const action = resolveAction(settings, actionRequest);
  const output = await transform(text, action, settings);
  await browser.tabs.sendMessage(tabId, {
    type: settings.previewResults ? 'SHOW_RESULT' : 'REPLACE_RESULT',
    output,
    label: action.mode === 'rewrite' ? 'Rewritten' : action.inputMode === 'prompt' ? 'Generated' : 'Corrected',
  });
}

async function showError(tabId, error) {
  if (!tabId) return;
  try {
    await ensureContent(tabId);
    await browser.tabs.sendMessage(tabId, {type: 'SHOW_ERROR', message: error.message || String(error)});
  } catch { /* Firefox blocks extension scripts on internal pages. */ }
}

function resolveAction(settings, request) {
  if (request.mode === 'custom') {
    const item = enabledActions(settings).find(action => action.id === request.actionId);
    if (!item) throw new Error('That custom action no longer exists.');
    return {...item, mode: 'custom', inputMode: item.inputMode === 'prompt' ? 'prompt' : 'transform'};
  }
  if (request.mode === 'prompt') return {...settings.promptOptions, mode: 'prompt', inputMode: 'prompt', prompt: settings.prompts.prompt};
  const mode = request.mode === 'rewrite' ? 'rewrite' : 'correct';
  return {mode, inputMode: 'transform', prompt: settings.prompts[mode], provider: '', model: '', inputLimit: 0, outputLimit: 0};
}

function estimateTokens(text) { return Math.ceil(text.length / 4); }
function maxTokens(text, value = 0) { return positiveInt(value) || Math.min(2000, Math.max(220, estimateTokens(text) + 180)); }
function positiveInt(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0; }
function payload(text) { return `Transform only the text inside the tags.\nReturn only the transformed text.\n<text>\n${text}\n</text>`; }

function expandPrompt(prompt, text, variables) {
  const values = {...variables, selection: text};
  return (prompt || '').replace(/\$\{(selection|language|tone|style)\}/g, (_match, name) => values[name] || '');
}

function cleanOutput(text, inputMode) {
  let output = text.trim();
  if (inputMode === 'prompt') return output;
  const tagged = output.match(/^<text>\s*([\s\S]*?)\s*<\/text>$/i);
  if (tagged) output = tagged[1].trim();
  const fenced = output.match(/^```(?:text)?\s*\n?([\s\S]*?)\n?```$/i);
  return fenced ? fenced[1].trim() : output;
}

async function requestJson(url, headers, body, provider, model) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...headers},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new Error(`Could not connect to ${PROVIDER_NAMES[provider]}. Check your connection.`);
  }
  let data = {};
  try { data = await response.json(); } catch { /* handled below */ }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error(`${PROVIDER_NAMES[provider]} rejected the API key. Check it in Settings.`);
    if (response.status === 404) throw new Error(`${PROVIDER_NAMES[provider]} could not find model “${model}”.`);
    if (response.status === 429) throw new Error(`${PROVIDER_NAMES[provider]} rate limit reached. Wait and try again.`);
    const detail = data?.error?.message || data?.error;
    throw new Error(typeof detail === 'string' ? detail : `${PROVIDER_NAMES[provider]} rejected the request (${response.status}).`);
  }
  return data;
}

async function transform(text, action, settings) {
  const inputLimit = positiveInt(action.inputLimit);
  const estimate = estimateTokens(text);
  if (inputLimit && estimate > inputLimit) throw new Error(`Selected text is about ${estimate} tokens, above this action's ${inputLimit}-token input limit.`);
  const provider = action.provider || settings.provider;
  const model = action.model || settings.models[provider];
  const prompt = expandPrompt(action.prompt, text, settings.variables);
  const userText = action.inputMode === 'prompt' ? text : payload(text);
  const messages = [...(prompt.trim() ? [{role: 'system', content: prompt}] : []), {role: 'user', content: userText}];
  const limit = maxTokens(text, positiveInt(action.outputLimit) || (action.inputMode === 'prompt' ? 2000 : 0));
  let data;
  if (provider === 'ollama') {
    data = await requestJson(`${settings.ollamaUrl.replace(/\/$/, '')}/api/chat`, {}, {model, messages, stream: false, options: {num_predict: limit}}, provider, model);
    if (data.done_reason === 'length') throw new Error('Response reached the output limit. Increase the limit or select less text.');
    if (!data.message?.content) throw new Error('Ollama returned an empty response.');
    return cleanOutput(data.message.content, action.inputMode);
  }
  const key = settings.apiKeys[provider];
  if (!key) throw new Error(`Add a ${PROVIDER_NAMES[provider]} API key in Settings.`);
  if (provider === 'gemini') {
    const body = {contents: [{role: 'user', parts: [{text: userText}]}], generationConfig: {maxOutputTokens: limit}};
    if (prompt.trim()) body.systemInstruction = {parts: [{text: prompt}]};
    data = await requestJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {}, body, provider, model);
    if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('Response reached the output limit. Increase the limit or select less text.');
    const output = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('');
    if (!output) throw new Error('Gemini returned an empty response.');
    return cleanOutput(output, action.inputMode);
  }
  const urls = {groq: 'https://api.groq.com/openai/v1/chat/completions', openrouter: 'https://openrouter.ai/api/v1/chat/completions', cerebras: 'https://api.cerebras.ai/v1/chat/completions', openai: 'https://api.openai.com/v1/chat/completions', vercel: 'https://ai-gateway.vercel.sh/v1/chat/completions'};
  const body = {model, messages, [provider === 'cerebras' ? 'max_completion_tokens' : 'max_tokens']: limit};
  if (provider === 'groq' && model.startsWith('openai/gpt-oss-')) Object.assign(body, {reasoning_effort: 'low', include_reasoning: false});
  data = await requestJson(urls[provider], {Authorization: `Bearer ${key}`, ...(provider === 'openrouter' ? {'X-Title': 'PromptPaste'} : {})}, body, provider, model);
  if (data.choices?.[0]?.finish_reason === 'length') throw new Error('Response reached the output limit. Increase the limit or select less text.');
  const output = data.choices?.[0]?.message?.content;
  if (!output) throw new Error(`${PROVIDER_NAMES[provider]} returned an empty response.`);
  return cleanOutput(output, action.inputMode);
}
