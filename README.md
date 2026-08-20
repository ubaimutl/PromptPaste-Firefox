# PromptPaste

Use AI on selected text in Firefox. Correct writing, rewrite text, run a selection as a prompt, or create custom actions. Results can be reviewed and edited before replacing the original selection.

## Features

- **Multiple AI providers** — Ollama, Groq, Gemini, OpenRouter, Cerebras, OpenAI, and Vercel AI Gateway
- **Model discovery** — Refresh available models after configuring a provider, while still allowing manual model names
- **Built-in actions** — Professional email, summarize, translate, explain simply (customizable)
- **Custom actions** — Create your own prompts with variables and model settings
- **Flexible UI** — Floating action dot on selection, context menu, toolbar button, keyboard shortcuts
- **Review before replace** — Preview and edit AI output before applying
- **Local-first privacy** — API keys stored in Firefox extension storage; Ollama requests never leave your machine

## Install

[![Get it on Firefox Add-ons](https://img.shields.io/badge/Firefox_Add-ons-Install-orange?logo=firefox-browser)](https://addons.mozilla.org/firefox/addon/promptpaste/)

_Link will be active once the add-on is approved by Mozilla._

## Usage

1. Open **PromptPaste Settings** (toolbar button → Settings)
2. Choose a provider and enter its API key; Ollama uses only its server URL and never needs an API key
3. Select text on any webpage
4. Click the action dot, use the context menu (PromptPaste submenu), or press the keyboard shortcut
5. Choose an action → review the result → click **Replace** or **Copy**

Disable the floating dot in **Settings → General → Page controls**. History is disabled by default for privacy; enable **Save history** when you want to review, copy, delete, or clear local results from the popup. **Status feedback** defaults to the bottom center, or can follow the selected text or mouse pointer.

## Supported Fields

- Text inputs (`<input>`, `<textarea>`)
- Contenteditable elements
- Most rich-text editors (some complex editors manage their own document model and may not accept replacement)

## Privacy

- Text is sent **only when you explicitly choose an action**
- API keys stored in Firefox's `storage.local` (encrypted at rest)
- Ollama requests go to your configured server only and do not use an API key
- Firefox requests to local Ollama use a Page Assist-style Origin rewrite, so Ollama's default CORS policy accepts them without changing Firefox or Ollama settings
- No telemetry, no background requests
