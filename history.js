import {getSettings} from './shared.js';

const listRoot = document.querySelector('#history-list');
const enabledToggle = document.querySelector('#history-enabled');
const clearButton = document.querySelector('#clear');
const settingsButton = document.querySelector('#open-settings');

let settings = await getSettings();
enabledToggle.checked = settings.historyEnabled === true;
settingsButton.addEventListener('click', () => browser.runtime.openOptionsPage());
enabledToggle.addEventListener('change', async () => {
  const previous = settings.historyEnabled === true;
  settings.historyEnabled = enabledToggle.checked;
  try {
    await browser.storage.local.set({historyEnabled: enabledToggle.checked});
  } catch (error) {
    settings.historyEnabled = previous;
    enabledToggle.checked = previous;
    showStorageError(error);
    return;
  }
  render();
});

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || (!changes.history && !changes.historyEnabled && !changes.historyLimit)) return;
  settings = await getSettings();
  enabledToggle.checked = settings.historyEnabled === true;
  render();
});
clearButton.addEventListener('click', async () => {
  if (!confirm('Remove all stored results? This cannot be undone.')) return;
  try {
    await browser.storage.local.set({history: []});
    settings.history = [];
    render();
  } catch (error) {
    showStorageError(error);
  }
});

function relativeTime(ts) {
  const diff = Date.now() - (ts || 0);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text || '');
      return;
    } catch { /* Try the extension-page fallback below. */ }
  }
  const fallback = document.createElement('textarea');
  fallback.value = text || '';
  fallback.style.position = 'fixed';
  fallback.style.opacity = '0';
  document.body.append(fallback);
  fallback.focus();
  fallback.select();
  try {
    if (!document.execCommand('copy')) throw new Error('copy failed');
  } finally {
    fallback.remove();
  }
}

function copyButton(label, text) {
  const button = rowButton(label, async () => {
    try {
      await copyText(text);
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = label; }, 1200);
    } catch {
      button.textContent = 'Copy failed';
      setTimeout(() => { button.textContent = label; }, 1800);
    }
  });
  return button;
}

function showStorageError(error) {
  listRoot.replaceChildren();
  const note = document.createElement('p');
  note.className = 'history-message history-disabled';
  note.textContent = `Could not update history storage: ${error?.message || 'unknown storage error'}`;
  listRoot.append(note);
}

function render() {
  listRoot.replaceChildren();
  const list = Array.isArray(settings.history) ? settings.history : [];
  clearButton.disabled = list.length === 0;
  if (settings.historyEnabled === false) {
    const note = document.createElement('p');
    note.className = 'history-message history-disabled';
    note.textContent = 'History is disabled. Enable “Save history” to start keeping results.';
    listRoot.append(note);
    return;
  }
  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'history-message empty';
    empty.textContent = 'No results yet. Run an action on selected text to build history.';
    listRoot.append(empty);
    return;
  }
  for (const entry of list) {
    const row = document.createElement('div');
    row.className = 'history-entry';
    const text = document.createElement('div');
    text.className = 'history-entry-content';
    const name = document.createElement('strong');
    name.className = 'history-entry-name';
    name.textContent = entry.actionName || 'Result';
    const meta = document.createElement('small');
    meta.className = 'history-entry-meta';
    meta.textContent = `${relativeTime(entry.ts)} · ${entry.provider || 'provider'}${entry.model ? ` · ${entry.model}` : ''}`;
    text.append(name, meta);

    const snippet = document.createElement('small');
    snippet.className = 'history-entry-snippet';
    snippet.textContent = (entry.output || '').replace(/\s+/g, ' ').slice(0, 180) || 'No output preview';
    text.append(snippet);

    const controls = document.createElement('div');
    controls.className = 'history-entry-actions';
    controls.append(
      copyButton('Copy', entry.output),
      rowButton('View', () => toggleDetails(details)),
      rowButton('Delete', () => removeEntry(entry.id), true),
    );

    const details = document.createElement('div');
    details.className = 'history-entry-details';
    details.hidden = true;
    const inputLabel = document.createElement('label');
    inputLabel.textContent = 'Input';
    const input = document.createElement('textarea');
    input.readOnly = true;
    input.value = entry.input || '';
    const outputLabel = document.createElement('label');
    outputLabel.textContent = 'Output';
    const output = document.createElement('textarea');
    output.readOnly = true;
    output.value = entry.output || '';
    details.append(inputLabel, input, outputLabel, output);
    const detailActions = document.createElement('div');
    detailActions.className = 'history-detail-actions';
    detailActions.append(copyButton('Copy input', entry.input), copyButton('Copy output', entry.output));
    details.append(detailActions);

    row.append(text, controls);
    row.append(details);
    listRoot.append(row);
  }
}

function toggleDetails(details) {
  details.hidden = !details.hidden;
}

function rowButton(label, click, danger = false) {
  const button = document.createElement('button');
  button.className = danger ? 'text-button danger' : 'text-button';
  button.textContent = label;
  button.addEventListener('click', click);
  return button;
}

async function removeEntry(id) {
  try {
    const stored = await browser.storage.local.get({history: []});
    const list = Array.isArray(stored.history) ? stored.history : [];
    settings.history = list.filter(item => item.id !== id);
    await browser.storage.local.set({history: settings.history});
    render();
  } catch (error) {
    showStorageError(error);
  }
}

render();
