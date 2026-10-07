# AI Quiz Generator (Generator Soal)

**Live demo:** https://ai-soal.vercel.app

A web app that turns learning material into ready-to-use exam questions. Upload a `.txt`, `.pdf`, or `.docx` file (or paste text), choose how many questions you want, and the app generates **multiple-choice and essay questions** using the Google Gemini API.

## Highlights

- **Document parsing in the browser:** reads TXT, PDF, and DOCX files before sending the text to the model.
- **Self-healing output:** LLM responses are validated (JSON structure, question count). If the output is malformed, the server automatically asks the model to repair it, up to 3 retries, before showing an error.
- **Secure API key handling:** the Gemini key lives only in a serverless function (environment variable) and is never exposed to the browser.
- **Deployable anywhere:** includes both a Vercel function (`api/`) and a Netlify function (`netlify/functions/`).

## Tech Stack

HTML · CSS · JavaScript · Serverless Functions (Vercel / Netlify) · Google Gemini API

## Project Structure

```
index.html                          # Frontend (static)
api/generate-quiz.js                # Vercel serverless function
netlify/functions/generate-quiz.js  # Netlify serverless function
netlify.toml                        # Netlify config
```

## Run / Deploy

1. Get a free Gemini API key at https://aistudio.google.com/apikey
2. Deploy the repo to **Vercel** or **Netlify** (no build step needed).
3. Add the environment variable `GEMINI_API_KEY` in the project settings and redeploy.

> Free-tier Gemini requests are rate-limited. If a limit is reached, the app shows the error and you can retry later.

## What I Learned

- Prompt design and validating LLM output in production
- Keeping secrets server-side with serverless functions
- Handling file uploads and text extraction on the client
