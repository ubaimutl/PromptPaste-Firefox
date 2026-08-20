import {enabledActions, getSettings} from './shared.js';

const actionsRoot = document.querySelector('#actions');
const status = document.querySelector('#status');
document.querySelector('#settings').addEventListener('click', () => browser.runtime.openOptionsPage());

const settings = await getSettings();
const builtInActions = [
  {name: 'Correct selected text', mode: 'correct'},
  {name: 'Rewrite selected text', mode: 'rewrite'},
  {name: 'Run selected prompt', mode: 'prompt'},
];
const customActions = enabledActions(settings).map(action => ({name: action.name, mode: 'custom', actionId: action.id}));

for (const action of [...builtInActions, ...customActions]) {
  if (action === customActions[0]) {
    const separator = document.createElement('div');
    separator.className = 'menu-separator';
    actionsRoot.append(separator);
  }
  const button = document.createElement('button');
  button.className = 'action-row menu-row';
  const glyph = document.createElement('span');
  glyph.className = 'action-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.append(actionIcon(action.mode));
  const label = document.createElement('span');
  label.className = 'action-label';
  label.textContent = action.name;
  button.append(glyph, label);
  button.addEventListener('click', () => run(action, button));
  actionsRoot.append(button);
}

function actionIcon(mode) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  const addPath = (d, className = '') => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    if (className) path.setAttribute('class', className);
    svg.append(path);
  };
  if (mode === 'correct') addPath('m4 10 3.2 3.2L16 4.8');
  else if (mode === 'rewrite') {
    addPath('M15.5 7A6 6 0 1 0 16 12');
    addPath('M12 3h4v4');
  } else if (mode === 'prompt') addPath('m7 4 8 6-8 6Z', 'filled');
  else addPath('m10 2 1.5 5.1L16.5 9l-5 1.9L10 16l-1.5-5.1L3.5 9l5-1.9Z');
  return svg;
}

async function run(action, button) {
  status.hidden = true;
  document.querySelectorAll('.action-row').forEach(item => item.disabled = true);
  button.classList.add('busy');
  const [tab] = await browser.tabs.query({active: true, currentWindow: true});
  try {
    const response = await browser.runtime.sendMessage({type: 'RUN_ACTION', tabId: tab?.id, action});
    if (!response?.ok) throw new Error(response?.error || 'Could not run this action.');
    window.close();
  } catch (error) {
    status.textContent = error.message || 'Could not run this action.';
    status.hidden = false;
    document.querySelectorAll('.action-row').forEach(item => item.disabled = false);
    button.classList.remove('busy');
  }
}
