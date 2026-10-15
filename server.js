require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenAI } = require('@google/genai');
const Groq = require('groq-sdk');
const OpenAI = require('openai');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/markdown' || file.originalname.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(new Error('Only markdown files are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize AI clients
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Optional providers are only created when their key is set: the current SDKs
// throw at construction on a missing key, which would stop the server starting.
// Unlike the other SDKs, @google/genai only retries when retryOptions is set;
// without it a brief "high demand" 503 fails the request outright.
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { retryOptions: { attempts: 4 } }
    })
  : null;

// Initialize Groq client
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Initialize xAI (Grok) client - uses OpenAI-compatible API
const xai = process.env.XAI_API_KEY
  ? new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: 'https://api.x.ai/v1' })
  : null;

// Initialize OpenRouter client - uses OpenAI-compatible API
const openrouter = process.env.OPENROUTER_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1' })
  : null;

// Available models configuration
const AI_MODELS = {
  anthropic: {
    name: 'Claude Haiku 5.5',
    model: 'claude-haiku-5-5',
    provider: 'Anthropic',
    description: 'Fast & low-cost Claude'
  },
  gemini: {
    name: 'Gemini 3.8 Flash',
    model: 'gemini-3.8-flash',
    provider: 'Google',
    description: 'Latest stable Flash model'
  },
  groq: {
    name: 'GPT-OSS 120B',
    model: 'openai/gpt-oss-120b',
    provider: 'Groq',
    description: 'Free & ultra-fast flagship'
  },
  qwen: {
    name: 'Qwen 3.8 27B',
    model: 'qwen/qwen3.8-27b',
    provider: 'Groq',
    description: 'Zero-cost reasoning powerhouse'
  },
  gptoss20b: {
    name: 'GPT-OSS 20B',
    model: 'openai/gpt-oss-20b',
    provider: 'Groq',
    description: 'Free & fastest lightweight model'
  },
  // Direct to xAI when its key is set, otherwise through OpenRouter
  grok: process.env.XAI_API_KEY
    ? { name: 'Grok 4.7', model: 'grok-4.7', provider: 'xAI', description: "xAI's most capable model" }
    : { name: 'Grok 4.7', model: 'x-ai/grok-4.7', provider: 'OpenRouter', description: "xAI's most capable model" },
  gpt61: {
    name: 'GPT-6.1 Sol Pro',
    model: 'openai/gpt-6.1-sol-pro',
    provider: 'OpenRouter',
    description: "OpenAI's newest model"
  },
  deepseek: {
    name: 'DeepSeek V4.1 Flash',
    model: 'deepseek/deepseek-v4.1-flash',
    provider: 'OpenRouter',
    description: 'Cheapest capable model'
  },
  kimi: {
    name: 'Kimi K3',
    model: 'moonshotai/kimi-k3',
    provider: 'OpenRouter',
    description: "Moonshot's flagship"
  },
  // The model is chosen per request from the full OpenRouter catalogue
  openrouter: {
    name: 'Any OpenRouter model',
    model: null,
    provider: 'OpenRouter',
    description: 'Pick from the full catalogue'
  }
};

// Providers reached through an OpenAI-compatible chat completions API
const CHAT_COMPLETION_CLIENTS = { Groq: groq, xAI: xai, OpenRouter: openrouter };

const PROVIDER_API_KEYS = {
  Anthropic: 'ANTHROPIC_API_KEY',
  Google: 'GEMINI_API_KEY',
  Groq: 'GROQ_API_KEY',
  xAI: 'XAI_API_KEY',
  OpenRouter: 'OPENROUTER_API_KEY'
};

const isConfigured = id => Boolean(process.env[PROVIDER_API_KEYS[AI_MODELS[id].provider]]);

// Errors caused by the request itself (unknown provider, missing key), sent back as-is
function requestError(status, message, details) {
  return Object.assign(new Error(message), { status, details, isRequestError: true });
}

// Calls the chosen provider and returns the model's text reply, model info and token usage
async function generateText({ provider = 'anthropic', model: requestedModel, systemPrompt, userPrompt }) {
  const selected = AI_MODELS[provider];
  if (!selected) {
    throw requestError(400, `Unknown provider: ${provider}`);
  }
  if (!isConfigured(provider)) {
    throw requestError(400, `${selected.provider} API key not configured`);
  }

  if (selected.provider in CHAT_COMPLETION_CLIENTS) {
    // Groq (FREE), xAI and OpenRouter. The OpenRouter picker sends its chosen model.
    const model = provider === 'openrouter' ? requestedModel : selected.model;
    if (!model) {
      throw requestError(400, 'Choose an OpenRouter model first');
    }

    const chatCompletion = await CHAT_COMPLETION_CLIENTS[selected.provider].chat.completions.create({
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      model,
      temperature: 0.7,
      max_tokens: 16000,
    });

    return {
      text: chatCompletion.choices[0]?.message?.content || '',
      truncated: chatCompletion.choices[0]?.finish_reason === 'length',
      modelInfo: provider === 'openrouter' ? { ...selected, model, name: model } : selected,
      usage: {
        input_tokens: chatCompletion.usage?.prompt_tokens || 0,
        output_tokens: chatCompletion.usage?.completion_tokens || 0
      }
    };
  }

  if (provider === 'gemini') {
    const result = await genAI.models.generateContent({
      model: AI_MODELS.gemini.model,
      contents: userPrompt,
      config: { systemInstruction: systemPrompt }
    });

    return {
      text: result.text || '',
      truncated: result.candidates?.[0]?.finishReason === 'MAX_TOKENS',
      modelInfo: AI_MODELS.gemini,
      usage: {
        input_tokens: result.usageMetadata?.promptTokenCount || 0,
        output_tokens: result.usageMetadata?.candidatesTokenCount || 0
      }
    };
  }

  // Anthropic: streamed to avoid HTTP timeouts on long outputs. Thinking is on by
  // default for this model, so the reply can include thinking blocks before the text.
  const message = await anthropic.messages.stream({
    model: AI_MODELS.anthropic.model,
    max_tokens: 64000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ]
  }).finalMessage();

  if (message.stop_reason === 'refusal') {
    throw requestError(422, 'Claude declined this request', message.stop_details?.explanation || '');
  }

  return {
    text: message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join(''),
    truncated: message.stop_reason === 'max_tokens',
    modelInfo: AI_MODELS.anthropic,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens
    }
  };
}

const generationInfo = ({ modelInfo, usage, truncated }) => ({
  model: modelInfo.model,
  modelName: modelInfo.name,
  provider: modelInfo.provider,
  usage,
  truncated
});

function sendGenerationError(res, error, failureMessage) {
  if (error.isRequestError) {
    return res.status(error.status).json({ error: error.message, message: error.details });
  }

  console.error(`${failureMessage}:`, error);
  // Keep statuses the user can act on visible: out of credit, rate limited, overloaded
  const status = [402, 429, 503].includes(error.status) ? error.status : 500;
  res.status(status).json({
    error: failureMessage,
    message: readableErrorMessage(error)
  });
}

// Workflow, coverage checklist and field conventions of the user-story-test-case-generator
// skill (~/.claude/skills/user-story-test-case-generator), asked for as JSON so one reply can
// feed the analysis, the table and every export. Priority is kept as its own field.
const TEST_CASE_SYSTEM_PROMPT = `You are a Senior Software Tester / QA Lead. Given a user story (and any acceptance criteria, business rules, or requirements), decompose it requirement by requirement and produce exhaustive, directly usable test cases, plus a short analysis that surfaces gaps, ambiguities, hidden assumptions, and risks. A QA engineer should be able to execute the output manually or plan automation with minimal additional effort. Favor thoroughness over brevity: missing a scenario is worse than an extra one.

Workflow:
1. Read the whole input. Identify the actors, the feature or module, the trigger, the expected outcome, the data involved, and the system boundaries (frontend, backend, API, database, third parties).
2. Decompose it into a numbered inventory of atomic, individually testable requirements (R1, R2, ...). Treat each line of each acceptance criterion and each business rule as its own requirement, and split a criterion that hides several (a field, its validation, its persistence, its permission). Every test case must trace back to at least one requirement.
3. For every requirement, walk the coverage checklist below and generate the applicable cases.
4. Surface what the story does not say: hidden assumptions, ambiguities, missing or conflicting requirements, and risks. For each plausible but unstated behavior, add an implied test case (tag it "implied") and record the assumption. Turn genuinely unanswerable points into open questions.

Coverage checklist (each case has one primary type; secondary dimensions go in its tags):
- Functional / Positive: each acceptance criterion with valid, typical input; each happy path end to end; one representative per valid equivalence class; default values; success feedback.
- Negative: each required input omitted; invalid values, wrong types, malformed formats; operations in a disallowed state; graceful failure with a clear error, never a stack trace or a 500.
- Boundary: min and max, one below min and one above max; empty, single, and maximum-size collections; zero, negative, and very large numbers; min and max string length and length+1; first and last item; date edges.
- Validation: required vs optional enforced on the client and, separately, on the server; formats (email, phone, URL, dates, IDs); length, type, range, and precision; special characters, Unicode, whitespace, and case sensitivity; uniqueness.
- Integration: data handed correctly between frontend, backend, database, and third parties; side effects (events, webhooks, emails, notifications, audit logs) land downstream; dependent modules update; behavior when a dependency is slow or down; regression risk to adjacent features.
- Permission: each role's allowed and blocked actions; owner vs non-owner; horizontal (IDOR) and vertical access; unauthenticated and expired sessions; the server enforces what the UI hides.
- Workflow / State transition: the full flow per persona; every valid transition; illegal transitions blocked; abandon, resume, refresh, and back button; concurrent actors; idempotent completion.
- UI: layout; loading, empty, error, and success states; a meaningful browser tab title; field behavior (tab order, focus, enable/disable, inline errors); accessibility (keyboard, labels/ARIA, contrast); localization and RTL (Arabic); cross-browser rendering.
- Responsive (mandatory for every requirement with a UI surface; type UI or Compatibility with the tag "responsive"): mobile (~375px), tablet (~768px), and desktop (~1280px) plus the reflow boundary; orientation; touch targets of about 44px; long and RTL text at the smallest width; on-screen keyboard and safe areas; 200% zoom and large fonts.
- Security: authentication required; expired or invalid tokens rejected; privilege escalation and IDOR blocked; injection on every input that reaches a query; stored and reflected XSS neutralized; CSRF; rate limiting and brute-force protection; sensitive data kept out of responses, URLs, logs, and errors; session handling.
- API: status codes (2xx and the relevant 400/401/403/404/409/422/429, with 5xx handled); response schema and types; required vs optional params; a consistent error body; idempotency and safe retries; pagination, sorting, and filtering; content type; auth headers.
- Database: the stored record and its read-back; NOT NULL, unique, foreign-key, and check constraints; cascade vs restrict; soft vs hard delete; rollback on partial failure; concurrent writes without lost updates; defaults, timestamps, and audit columns.
- Performance: response time under normal load; large datasets; concurrent requests; no N+1 or unbounded queries; heavy operations finish or stream within limits.
- Edge / Error: null and empty data; network failure or timeout mid-operation; duplicate submission; stale data and concurrent edits; partial failure leaves the system consistent; malformed or oversized payloads rejected cleanly.
For every requirement ask: what did the story not say, what happens when it fails halfway, who should not be able to do this, what is the smallest and largest it can be, does it persist and survive a reload, what is the API contract and how does it fail, what breaks at high volume, and does the UI hold up on a phone, a tablet, at 200% zoom, and in RTL.

Per-requirement coverage floor. Wherever the layer applies, each requirement gets separate, dedicated cases:
- Backend (the requirement has an endpoint, stores or reads data, or calls a service): at least one API case that calls the endpoint directly rather than through the UI, at least one Database case that checks the stored record and its constraints, an Integration case for each side effect, and Security cases proving the server enforces access. A Functional case driven through the UI does not count as API or Database coverage.
- Frontend (the requirement has a screen, form, component, or visible state): at least one UI case for its states, field behavior, accessibility, and RTL; at least one responsive case; and client-side and server-side validation tested separately.
If a layer does not apply to a requirement, say so in the assumptions or risks instead of leaving it out silently. Thin stories get more inferred cases, not fewer.

Field conventions:
- testCaseId: TC-001, TC-002, ... zero-padded, sequential, and unique.
- title: a concise "action → outcome", e.g. "Reject password shorter than 8 chars".
- moduleFeature: the module, screen, or endpoint under test, taken from the story.
- preconditions: what must be true before step 1 (state, seeded data, role or session, feature flags).
- tags: comma-separated, lowercase, with no "@" prefix: the secondary dimensions (e.g. smoke, negative, security, api, responsive, implied) and the requirement IDs the case covers (e.g. R1). Priority has its own field, so do not put P1/P2/P3 in tags.
- priority: High (critical path, security, or data loss), Medium, or Low.
- steps: one discrete action per step, so a case usually has 3 to 6 steps (set up or navigate, act, then verify each observable outcome, such as the stored record or the email sent). Each step is imperative ("Enter ...", "Send POST ...", "Verify ...") and paired with its specific, verifiable expected result (an exact message, status code, stored state, or UI change), never "works correctly". The last step's result is the overall pass condition. Do not number the steps.
- typeOfTestCase: one of Functional, UI, API, Database, Integration, Security, Performance, Validation, Negative, Boundary, Permission, Workflow, Usability, Compatibility, Smoke, Regression.
- estimate: junior-paced manual execution time for that one case, including setup and one re-run on failure, e.g. "3m", "5m", "10m". Estimate generously.
- owner: "Mohamed Atallah" unless the user names another owner.
- automationStatus: Not Automated, To Be Automated, Automated, or Not Applicable. Default To Be Automated; use Not Applicable for inherently manual cases.
- state: Draft, Ready for Review, Approved, or Deprecated. Default Draft.

Quality bar: every requirement has at least one positive case and, where it can fail, at least one negative or validation case. Be specific and executable, so a different tester reaches the same verdict. No duplicates and no filler. When unsure, generate the case and flag the assumption. Map Gherkin scenarios to cases and add the negative, boundary, and security variants Gherkin usually omits. If the user provides their own field values or picklists, follow theirs. If the user writes in Arabic or mixes Arabic and English, mirror their language in the content while keeping the JSON keys in English. Keep the wording of every value terse: short imperative phrases, not long multi-clause sentences. Terse applies to the wording, never to the number of steps or cases.

Return only a JSON object in this shape:
{
  "analysis": {
    "storyTitle": "short name of the story",
    "requirementInventory": [{ "id": "R1", "requirement": "...", "source": "AC1" }],
    "assumptions": ["..."],
    "openQuestions": ["a direct question for the story author"],
    "risks": ["a missing requirement or risk area to cover"]
  },
  "testCases": [
    {
      "testCaseId": "TC-001",
      "title": "...",
      "moduleFeature": "...",
      "preconditions": "...",
      "tags": "smoke, functional, R1",
      "priority": "High",
      "steps": [{ "step": "Navigate to the login page", "result": "Login form is displayed" }],
      "typeOfTestCase": "Functional",
      "estimate": "3m",
      "owner": "Mohamed Atallah",
      "automationStatus": "To Be Automated",
      "state": "Draft"
    }
  ]
}
The output must be valid JSON that parses as-is: no comments, no trailing commas, and no code or expressions. Write every value out literally; for long or generated test data, describe it in words (for example "a 256-character password") instead of writing an expression like "a" * 256, and describe injection or script payloads in words instead of writing them raw.`;

// Test case generation endpoint
app.post('/api/generate-test-cases', async (req, res) => {
  try {
    const { userStory, preferences, provider, model } = req.body;

    if (!userStory) {
      return res.status(400).json({ error: 'User story is required' });
    }

    const userPrompt = `Generate test cases for the following user story:

${userStory}

${preferences ? `Additional preferences:\n${preferences}\n` : ''}`;

    const result = await generateText({ provider, model, systemPrompt: TEST_CASE_SYSTEM_PROMPT, userPrompt });

    res.json({
      success: true,
      testCases: result.text,
      ...generationInfo(result)
    });

  } catch (error) {
    sendGenerationError(res, error, 'Failed to generate test cases');
  }
});

// Sections and rules of the bug-report-generator skill (~/.claude/skills/bug-report-generator),
// asked for as JSON so one reply can feed the report view, the table and every export.
const BUG_REPORT_SYSTEM_PROMPT = `You are a senior QA engineer. Turn the user's issue description into one clear, reproducible bug report.

Return only a JSON object with exactly these fields:
{
  "title": "<screen or area>: <what is wrong>",
  "link": "story or test-case ID, or the URL of the page where it reproduces",
  "environment": {
    "appSystem": "name and version if known",
    "os": "e.g. Windows 11, macOS 14, Android 13, iOS",
    "browserClient": "browser or client, if applicable",
    "testEnvironment": "e.g. Staging, UAT, Production"
  },
  "stepsToReproduce": ["first step, including the setup: role, language, data state, device", "next step"],
  "actualResult": "what currently happens, specific and observable",
  "expectedResult": "what should happen instead, based on requirements or reasonable behavior",
  "apiEvidence": null,
  "severity": "Critical | High | Medium | Low",
  "priority": "High | Medium | Low"
}

Rules:
1. Report observable, user-visible behavior only, never technical solutions, explanations, or causes. Never include root causes or hypotheses, fixes, code or stack traces, file paths, function, class, or component names, databases or tables, frameworks, libraries, or internal architecture. APIs and endpoints go only in apiEvidence, never in the other fields.
2. Keep every field short, punchy, and professional. Use formal QA language; remove anything that does not help reproduce or observe the issue.
3. Keep the title short and plain, e.g. "Home dashboard (Arabic): the net worth value is cut off at the top". Name the screen, then what is wrong. Never a vague title such as "Button doesn't work", and never a long sentence explaining the mechanism, the comparison, or the consequence.
4. Fill every field. Infer missing values when necessary and label each inline, for example "Staging (assumed)".
5. Set link to the story or test-case ID; if none exists, use the URL where the issue reproduces.
6. Make the steps granular and ordered, without numbering them. Put the setup (role, data state, device) and dependent conditions such as locale, screen size, offline state, or slow connection inside the steps; there is no separate preconditions field.
7. Contrast actualResult and expectedResult with specific observable behavior, never "it fails". Severity measures system impact: Critical = system crash, data loss, security issue, or complete feature failure; High = major feature broken with no workaround; Medium = feature partially broken or a workaround exists; Low = minor UI issue, cosmetic, or edge case. Priority measures fix urgency. Give each rating without defending it.
8. Say it once. Do not restate the defect in a second field.
9. apiEvidence: a bug is backend-related when the API returns a wrong status (4xx/5xx), wrong or missing data, or breaks a business rule (a wrong validation or permission result, a wrong calculation, a wrong state change). For a purely front-end/UI bug, set apiEvidence to null. For a backend-related bug, set it to a Markdown string holding the evidence found in the description: the request (method, full URL, and the payload or params that matter), the response (status code and body in a JSON code block), a cURL of the failing request, and/or a Telescope link. Never invent evidence: if the bug is backend-related but the description contains none, set apiEvidence to exactly "MISSING".
10. Never include secrets: replace bearer tokens, cookies, passwords, and API keys with <token> or <redacted>.
11. Never add fields beyond the ones above: no notes, description, summary, observation, preconditions, module, component, recommendations, suggested fix, root cause, analysis, or attachments.
12. The output must be valid JSON that parses as-is: no comments, no trailing commas, and no code or expressions.`;

// Bug report generation endpoint
app.post('/api/generate-bug-report', async (req, res) => {
  try {
    const { issue, preferences, provider, model } = req.body;

    if (!issue) {
      return res.status(400).json({ error: 'Issue description is required' });
    }

    const userPrompt = `Write a bug report for the following issue:

${issue}

${preferences ? `Additional preferences:\n${preferences}\n` : ''}`;

    const result = await generateText({ provider, model, systemPrompt: BUG_REPORT_SYSTEM_PROMPT, userPrompt });

    res.json({
      success: true,
      report: result.text,
      ...generationInfo(result)
    });

  } catch (error) {
    sendGenerationError(res, error, 'Failed to generate bug report');
  }
});

// Google's SDK puts the raw JSON error body in the message; return just its text
function readableErrorMessage(error) {
  try {
    return JSON.parse(error.message).error.message || error.message;
  } catch {
    return error.message;
  }
}

// Get available AI providers endpoint
app.get('/api/providers', (req, res) => {
  const providers = Object.keys(AI_MODELS).filter(isConfigured).map(id => ({
    id: id,
    name: AI_MODELS[id].name,
    provider: AI_MODELS[id].provider,
    description: AI_MODELS[id].description,
    available: true,
    ...(AI_MODELS[id].provider === 'Groq' && { free: true })
  }));

  res.json({ providers });
});

// OpenRouter catalogue for the model picker, cached for an hour
const OPENROUTER_MODELS_TTL_MS = 60 * 60 * 1000;
let openRouterModelsCache = { fetchedAt: 0, models: [] };

app.get('/api/openrouter/models', async (req, res) => {
  try {
    if (Date.now() - openRouterModelsCache.fetchedAt > OPENROUTER_MODELS_TTL_MS) {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }
      const { data } = await response.json();

      openRouterModelsCache = {
        fetchedAt: Date.now(),
        models: data
          .filter(m => m.architecture?.output_modalities?.includes('text'))
          .map(m => ({
            id: m.id,
            name: m.name,
            contextLength: m.context_length,
            // USD per 1M tokens; negative means the price varies per request
            inputPrice: Number(m.pricing?.prompt) * 1e6,
            outputPrice: Number(m.pricing?.completion) * 1e6
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      };
    }

    res.json({ models: openRouterModelsCache.models });
  } catch (error) {
    console.error('OpenRouter models fetch error:', error);
    res.status(500).json({
      error: 'Failed to load OpenRouter models',
      message: error.message
    });
  }
});

// ClickUp integration endpoint
app.post('/api/clickup/fetch-task', async (req, res) => {
  try {
    const { taskId, apiToken } = req.body;

    if (!taskId || !apiToken) {
      return res.status(400).json({ error: 'Task ID and API token are required' });
    }

    // Fetch task from ClickUp API
    const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
      headers: {
        'Authorization': apiToken,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`ClickUp API error: ${response.statusText}`);
    }

    const task = await response.json();

    // Extract user story from task description or custom fields
    let userStory = task.description || '';

    // Include task name as title
    if (task.name) {
      userStory = `**${task.name}**\n\n${userStory}`;
    }

    // Add custom fields if they exist
    if (task.custom_fields && task.custom_fields.length > 0) {
      const storyField = task.custom_fields.find(field =>
        field.name.toLowerCase().includes('story') ||
        field.name.toLowerCase().includes('user story')
      );
      if (storyField && storyField.value) {
        userStory += `\n\n${storyField.value}`;
      }
    }

    res.json({
      success: true,
      userStory: userStory,
      taskName: task.name,
      taskId: task.id,
      taskUrl: task.url
    });

  } catch (error) {
    console.error('ClickUp fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch task from ClickUp',
      message: error.message
    });
  }
});

// File upload endpoint
app.post('/api/upload-story', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read the uploaded file
    const filePath = req.file.path;
    const content = await fs.readFile(filePath, 'utf-8');

    // Clean up the uploaded file
    await fs.unlink(filePath);

    res.json({
      success: true,
      userStory: content,
      filename: req.file.originalname
    });

  } catch (error) {
    console.error('File upload error:', error);

    // Clean up file if it exists
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }

    res.status(500).json({
      error: 'Failed to process uploaded file',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const modelsInfo = {};
  Object.keys(AI_MODELS).forEach(key => {
    modelsInfo[key] = AI_MODELS[key].model;
  });
  
  res.json({
    status: 'ok',
    models: modelsInfo,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI QA Assistant running on http://localhost:${PORT}`);
  console.log(`📝 Available models:`);
  Object.keys(AI_MODELS).forEach(key => {
    const isFree = AI_MODELS[key].provider === 'Groq' ? ' [FREE]' : '';
    console.log(`   - ${AI_MODELS[key].provider}: ${AI_MODELS[key].name} (${AI_MODELS[key].model || 'any model'})${isFree}`);
  });
});
