import {PROVIDERS, getSettings} from './shared.js';

let settings = await getSettings();
let saveTimer;
const $ = selector => document.querySelector(selector);

for (const select of [$('#provider'), $('#run-provider'), $('#action-provider')]) {
  if (select !== $('#provider')) select.add(new Option('Use active provider', ''));
  for (const provider of PROVIDERS) select.add(new Option(provider.name, provider.id));
}

$('#provider').value = settings.provider;
$('#preview').checked = settings.previewResults;
$('#selection-trigger').checked = settings.selectionTrigger;
$('#language').value = settings.variables.language;
$('#tone').value = settings.variables.tone;
$('#style').value = settings.variables.style;
$('#prompt-correct').value = settings.prompts.correct;
$('#prompt-rewrite').value = settings.prompts.rewrite;
$('#prompt-run').value = settings.prompts.prompt;
$('#run-provider').value = settings.promptOptions.provider;
$('#run-model').value = settings.promptOptions.model;
$('#run-input').value = settings.promptOptions.inputLimit || '';
$('#run-output').value = settings.promptOptions.outputLimit || '';
renderProviderFields();
renderActions();

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab,.page').forEach(item => item.classList.remove('active'));
  tab.classList.add('active');
  $(`#${tab.dataset.page}`).classList.add('active');
}));

$('#provider').addEventListener('change', () => { settings.provider = $('#provider').value; renderProviderFields(); queueSave(); });
$('#preview').addEventListener('change', () => { settings.previewResults = $('#preview').checked; queueSave(); });
$('#selection-trigger').addEventListener('change', () => { settings.selectionTrigger = $('#selection-trigger').checked; queueSave(); });
for (const [selector, key] of [['#language', 'language'], ['#tone', 'tone'], ['#style', 'style']]) {
  $(selector).addEventListener('input', () => { settings.variables[key] = $(selector).value; queueSave(); });
}
for (const [selector, key] of [['#prompt-correct', 'correct'], ['#prompt-rewrite', 'rewrite'], ['#prompt-run', 'prompt']]) {
  $(selector).addEventListener('input', () => { settings.prompts[key] = $(selector).value; queueSave(); });
}
for (const [selector, key] of [['#run-provider', 'provider'], ['#run-model', 'model'], ['#run-input', 'inputLimit'], ['#run-output', 'outputLimit']]) {
  $(selector).addEventListener('input', () => { settings.promptOptions[key] = key.endsWith('Limit') ? Number($(selector).value) || 0 : $(selector).value; queueSave(); });
}

$('#shortcuts').addEventListener('click', async () => {
  try {
    await browser.commands.openShortcutSettings();
  } catch {
    await browser.tabs.create({url: 'about:addons'});
  }
});
$('#add-action').addEventListener('click', () => openAction());
$('#action-form').addEventListener('submit', async event => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  const action = {
    id: $('#action-id').value || crypto.randomUUID(), name: $('#action-name').value.trim(), prompt: $('#action-prompt').value,
    inputMode: $('#action-mode').value, provider: $('#action-provider').value, model: $('#action-model').value.trim(),
    inputLimit: Number($('#action-input').value) || 0, outputLimit: Number($('#action-output').value) || 0, enabled: $('#action-enabled').checked,
  };
  if (!action.name || (!action.prompt.trim() && action.inputMode !== 'prompt')) return;
  const index = settings.customActions.findIndex(item => item.id === action.id);
  if (index >= 0) settings.customActions[index] = action; else settings.customActions.push(action);
  await saveNow();
  renderActions();
  $('#action-dialog').close();
});

function renderProviderFields() {
  const provider = $('#provider').value;
  const root = $('#provider-fields');
  root.replaceChildren();
  const fields = document.createElement('div'); fields.className = 'fields two provider-config';
  const model = field('Model', settings.models[provider] || '', false, value => { settings.models[provider] = value; queueSave(); });
  fields.append(model);
  if (provider === 'ollama') fields.append(field('Server URL', settings.ollamaUrl, false, value => { settings.ollamaUrl = value; queueSave(); }));
  else fields.append(field('API key', settings.apiKeys[provider] || '', true, value => { settings.apiKeys[provider] = value; queueSave(); }));
  root.append(fields);
}

function field(labelText, value, secret, onInput) {
  const label = document.createElement('label'); label.textContent = labelText;
  const input = document.createElement('input'); input.value = value; input.type = secret ? 'password' : 'text'; input.autocomplete = 'off';
  input.addEventListener('input', () => onInput(input.value)); label.append(input); return label;
}

function renderActions() {
  const root = $('#action-list'); root.replaceChildren();
  if (!settings.customActions.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No custom actions yet.'; root.append(empty); return; }
  settings.customActions.forEach((action, index) => {
    const row = document.createElement('div'); row.className = 'custom-row';
    const text = document.createElement('div'); text.className = 'custom-copy';
    const name = document.createElement('strong'); name.textContent = action.name;
    const detail = document.createElement('small'); detail.textContent = `${action.inputMode === 'prompt' ? 'Prompt' : 'Transform'} · ${action.provider ? PROVIDERS.find(p => p.id === action.provider)?.name : 'Active provider'}${action.enabled === false ? ' · Disabled' : ''}`;
    text.append(name, detail);
    const controls = document.createElement('div'); controls.className = 'row-buttons';
    controls.append(rowButton('Edit', () => openAction(action)), rowButton('↑', () => move(index, -1)), rowButton('↓', () => move(index, 1)), rowButton('Delete', () => removeAction(action.id), true));
    row.append(text, controls); root.append(row);
  });
}

function rowButton(text, click, danger = false) { const button = document.createElement('button'); button.className = danger ? 'text-button danger' : 'text-button'; button.textContent = text; button.addEventListener('click', click); return button; }
function move(index, direction) { const next = index + direction; if (next < 0 || next >= settings.customActions.length) return; [settings.customActions[index], settings.customActions[next]] = [settings.customActions[next], settings.customActions[index]]; saveNow(); renderActions(); }
function removeAction(id) { settings.customActions = settings.customActions.filter(item => item.id !== id); saveNow(); renderActions(); }

function openAction(action = {}) {
  $('#action-dialog-title').textContent = action.id ? 'Edit custom action' : 'New custom action';
  $('#action-id').value = action.id || ''; $('#action-name').value = action.name || ''; $('#action-prompt').value = action.prompt || '';
  $('#action-mode').value = action.inputMode || 'transform'; $('#action-provider').value = action.provider || ''; $('#action-model').value = action.model || '';
  $('#action-input').value = action.inputLimit || ''; $('#action-output').value = action.outputLimit || ''; $('#action-enabled').checked = action.enabled !== false;
  $('#action-dialog').showModal(); $('#action-name').focus();
}

function queueSave() { clearTimeout(saveTimer); $('#save-status').textContent = 'Saving…'; saveTimer = setTimeout(saveNow, 350); }
async function saveNow() { clearTimeout(saveTimer); await browser.storage.local.set(settings); $('#save-status').textContent = 'Saved'; setTimeout(() => { $('#save-status').textContent = ''; }, 1200); }
