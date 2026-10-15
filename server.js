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
    max_tokens: 32000,
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
    modelInfo: AI_MODELS.anthropic,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens
    }
  };
}

const generationInfo = ({ modelInfo, usage }) => ({
  model: modelInfo.model,
  modelName: modelInfo.name,
  provider: modelInfo.provider,
  usage
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

// Test case generation endpoint
app.post('/api/generate-test-cases', async (req, res) => {
  try {
    const { userStory, schema, preferences, provider, model } = req.body;

    if (!userStory) {
      return res.status(400).json({ error: 'User story is required' });
    }

    // Build the prompts
    const systemPrompt = `You are an expert software tester and QA engineer. Your task is to generate comprehensive test cases based on user stories.

${schema ? `Use the following test case schema:\n${schema}\n` : ''}

Generate test cases that include:
- Test Case ID
- Test Case Title
- Description
- Preconditions
- Test Steps
- Expected Results
- Test Data (if applicable)
- Priority (High/Medium/Low)
- Test Type (Functional/Non-functional/Integration/etc.)

Format the output as a structured JSON array of test cases. The output must be valid JSON that parses as-is: no comments, no trailing commas, and no code or expressions. Write every value out literally; for long or generated test data, describe it in words (for example "a 256-character password") instead of writing an expression like "a" * 256.`;

    const userPrompt = `Generate detailed test cases for the following user story:

${userStory}

${preferences ? `Additional preferences:\n${preferences}\n` : ''}

Please provide comprehensive test cases covering positive scenarios, negative scenarios, edge cases, and any relevant boundary conditions.`;

    const result = await generateText({ provider, model, systemPrompt, userPrompt });

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
  console.log(`🚀 AI Test Case Generator running on http://localhost:${PORT}`);
  console.log(`📝 Available models:`);
  Object.keys(AI_MODELS).forEach(key => {
    const isFree = AI_MODELS[key].provider === 'Groq' ? ' [FREE]' : '';
    console.log(`   - ${AI_MODELS[key].provider}: ${AI_MODELS[key].name} (${AI_MODELS[key].model || 'any model'})${isFree}`);
  });
});
