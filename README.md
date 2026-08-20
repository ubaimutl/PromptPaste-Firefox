# PromptPaste

Use AI on selected text in Firefox. Correct writing, rewrite text, run a selection as a prompt, or create custom actions. Results can be reviewed and edited before replacing the original selection.

## Features

- **Multiple AI providers** — OpenAI, Anthropic, Ollama, and custom OpenAI-compatible endpoints
- **Built-in actions** — Professional email, summarize, translate, explain simply (customizable)
- **Custom actions** — Create your own prompts with variables and model settings
- **Flexible UI** — Floating action dot on selection, context menu, toolbar button, keyboard shortcuts
- **Review before replace** — Preview and edit AI output before applying
- **Local-first privacy** — API keys stored in Firefox extension storage; Ollama requests never leave your machine

## Install

[![Get it on Firefox Add-ons](https://img.shields.io/badge/Firefox_Add-ons-Install-orange?logo=firefox-browser)](https://addons.mozilla.org/firefox/addon/promptpaste/)

_Link will be active once the add-on is approved by Mozilla._

## Usage

1. Open **PromptPaste Settings** (toolbar button → gear icon)
2. Choose a provider and enter your API key or Ollama URL
3. Select text on any webpage
4. Click the action dot, use the context menu (PromptPaste submenu), or press the keyboard shortcut
5. Choose an action → review the result → click **Replace** or **Copy**

Disable the floating dot in **Settings → General → Page controls**.

## Supported Fields

- Text inputs (`<input>`, `<textarea>`)
- Contenteditable elements
- Most rich-text editors (some complex editors manage their own document model and may not accept replacement)

## Privacy

- Text is sent **only when you explicitly choose an action**
- API keys stored in Firefox's `storage.local` (encrypted at rest)
- Ollama requests go to your configured local server only
- No telemetry, no background requests
