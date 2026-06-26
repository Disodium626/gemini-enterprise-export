# Gemini Enterprise Chat Exporter

A Tampermonkey userscript that exports individual sessions from [Gemini Enterprise](https://business.gemini.google/) to a [Codex](https://github.com/openai/codex) compatible rollout jsonl file.

## Why

Personal Gmail accounts that bought Gemini Enterprise Business Edition do not get access to the admin console or Google Takeout for business-managed chat history. This script pulls individual conversations out of the live web UI and saves them in the same .jsonl format Codex++ expects on disk, so they can be re-imported as a regular local session.

## What it does

- Walks every shadow root on the current page so the chat DOM is visible regardless of nesting depth.
- Finds the chat scroller (div.chat-mode-scroller) and slowly scrolls to the top to force the virtualized list to render every turn.
- Pairs each user <ucs-fast-markdown data-turn-index= N> with the following unindexed <ucs-fast-markdown> (the assistant reply) in document order.
- Pulls the visible text out of .markdown-document (including nested shadow roots) and emits a session_meta + alternating event_msg / 
esponse_item / 	urn_context lines.
- Downloads the result as 
ollout-<ISO>-<title>.jsonl using a Blob URL and <a download>, which works where GM_download does not.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Edge, Firefox, Safari).
2. Open gemini-enterprise-export.user.js in a new tab. Tampermonkey will recognize the userscript header and offer to install it.
3. Navigate to <https://business.gemini.google/> and sign in.
4. Open any session. A small panel pinned to the bottom-right of the page will appear.

## Use

- **Export** - scroll the current session to the top, extract every turn, and download the rollout.
- **Scan** - print a count of the custom-element tags visible in the DOM, plus the number of <a href=*/session/*> anchors the sidebar exposes. Handy for verifying that the page is actually a session and not the home screen.

The download lands in your browser default Downloads folder with a name like:

`
rollout-2026-06-26T20-34-12-583-_-My-Chat-Title.jsonl
`

## Import into Codex++

Codex++ loads sessions from CodexDesktop\sessions\<YYYY>\<MM>\. Move the downloaded jsonl there (matching year/month subfolders) and the next launch of Codex++ will pick it up as a regular local session.

## Output format

One JSON object per line, in this order:

`
{type:session_meta,payload:{...}}
{type:event_msg,payload:{type:user_message,message:...,timestamp:...}}
{type:response_item,payload:{role:user,content:[{type:input_text,text:...}]}}
{type:turn_context,payload:{}}
{type:event_msg,payload:{type:agent_message,message:...,timestamp:...}}
{type:response_item,payload:{role:assistant,content:[{type:output_text,text:...}]}}
...repeat per turn...
`

## Notes

- One session per click. Batch-export and zip packaging from earlier development was removed for clarity; the browser handles multi-file downloads fine.
- The script does not depend on any GM_* API and runs entirely in the page context. This is intentional: it works on enterprise pages where GM_download is unreliable.
- All logs are prefixed with [gex] in the browser DevTools console if you need to debug.

## Known limitations

- Only extracts plain text. Code blocks, images, and inline attachments inside the chat are not reconstructed; only the rendered text content is preserved.
- Requires a browser session that is already signed in to Gemini Enterprise. There is no separate auth flow.
- The script captures whatever is currently rendered. If a session is very long and the scroll loop times out before the top is reached, some early turns will be missing. Re-running it will not help; the underlying API does not expose the full transcript in one call.

## License

MIT, see LICENSE.
