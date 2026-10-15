# AI Test Case & Bug Report Generator

A web application that uses the latest AI models (**Claude Haiku 5.5**, **Gemini 3.8 Flash**, **GPT-OSS 120B**, and 460+ models via **OpenRouter**) to generate comprehensive test cases from user stories, and professional bug reports from issue descriptions.

## Features

- **Test Case Generation**: Turns a user story into test cases in the user-story-test-case-generator skill's format: a Part 1 analysis (requirement inventory, assumptions, open questions, risks, coverage summary and time estimate) and a Part 2 table in the skill's 12-column, one-row-per-step layout, plus a Priority column (High/Medium/Low)
- **Bug Report Mode**: Switch to *Bug Report* to turn an issue description into one bug report in the bug-report-generator skill's format (Title, Link, Environment, Steps to Reproduce, Actual/Expected Result, API Evidence for backend bugs, Severity, Priority)
- **Multiple Input Methods**:
  - **Manual Input**: Type or paste text directly (or click *Load Example*)
  - **ClickUp Import**: Import a user story directly from a ClickUp task
  - **File Upload**: Upload a markdown (`.md`) file
- **Multi-Model Support**: Claude Haiku 5.5, Gemini 3.8 Flash, GPT-OSS (120B & 20B), Qwen 3.8, and via OpenRouter: Grok 4.7, GPT-6.1 Sol Pro, DeepSeek V4.1 Flash, Kimi K3, or any model from a searchable picker. Only providers with a configured API key are shown
- **Preferences**: Override the defaults per run, e.g. owner, test case ID prefix, coverage focus or language
- **Three Result Views**: Formatted, Table (spreadsheet-style grid in the template layout) and Raw JSON
- **Export**: Copy as Markdown, or download as JSON, Markdown (the skill's file layout) or CSV (opens in Excel, Arabic included)
- **Token Usage Tracking**: See the model used and input/output tokens for each generation

## Prerequisites

- Node.js **22 or higher** (required by the `openai` SDK)
- npm
- An API key for **at least one** provider:
  - Anthropic: https://console.anthropic.com/settings/keys
  - Google Gemini: https://aistudio.google.com/apikey
  - Groq (free): https://console.groq.com/keys
  - xAI: https://console.x.ai/
  - OpenRouter: https://openrouter.ai/keys

## Installation

1. Clone the repository:
```bash
git clone https://github.com/muhamed-atallah/ai-test-case-generator.git
cd ai-test-case-generator
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file from the example:
```bash
cp .env.example .env
```

4. Add your API keys to `.env` (at least one is required; leave the rest empty):
```
ANTHROPIC_API_KEY=your_key
GEMINI_API_KEY=your_key
GROQ_API_KEY=your_key
XAI_API_KEY=your_key
OPENROUTER_API_KEY=your_key

PORT=3000
```
> [!NOTE]
> `PORT` is optional and defaults to **3000**. Grok 4.7 goes directly to xAI when `XAI_API_KEY` is set, otherwise through OpenRouter.

## Running the Application

### Development Mode (auto-reload on file save):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

The application will be available at `http://localhost:3000` (or the `PORT` you set in `.env`).

## Usage

### 1. Choose what to generate

Use the switch at the top of the page to pick **Test Cases** or **Bug Report**.

### 2. Provide your input

#### Option 1: Manual Input
1. Select the **Manual Input** card
2. Paste or type your user story (or issue description, in Bug Report mode)
   - Example: "As a user, I want to reset my password via email so that I can regain access if I forget it"

#### Option 2: ClickUp Import
1. Select the **ClickUp Import** card
2. Enter your ClickUp API Token
   - Get your token from: ClickUp Settings > Apps > API Token
   - The token is entered in the UI and is never stored in `.env`
3. Enter the Task ID or Custom ID (e.g., `86a179p6f` or `TASK-123`)
   - Find the Task ID in your ClickUp task URL
4. Click **Fetch Task** to import the user story from ClickUp
5. Review the fetched story in the preview section

#### Option 3: File Upload
1. Select the **File Upload** card
2. Either:
   - Drag and drop a `.md` file onto the upload area, or
   - Click **Browse Files** to select a file
3. Review the file content in the preview section

A sample story is included in [`example-user-story.md`](example-user-story.md).

### 3. Configure generation

1. **Test Case Schema (Optional, Test Cases mode)**: Specify your preferred test case format
   - Leave empty to use the default schema
   - Example schema:
   ```json
   {
     "testCaseId": "TC-XXX",
     "title": "Test title",
     "description": "Description",
     "preconditions": [],
     "steps": [],
     "expectedResults": [],
     "priority": "High/Medium/Low",
     "type": "Functional/Integration/etc"
   }
   ```

2. **Preferences (Optional)**: Specify additional requirements
   - Example: "Focus on security testing", "Use BDD format"

3. **AI Provider**: Pick a model. For *Any OpenRouter model*, search and choose one from the catalogue

### 4. Generate and export

Click **Generate**, review the result in the Formatted, Table or Raw JSON view, then copy it or download it as JSON, Markdown or CSV.

## Project Structure

```
ai-test-case-generator/
├── server.js              # Express backend: AI providers, ClickUp and upload endpoints
├── package.json           # Dependencies and scripts
├── .env.example           # Example environment variables (copy to .env)
├── example-user-story.md  # Sample user story for trying the app
├── README.md              # This file
└── public/
    ├── index.html         # Frontend interface
    ├── styles.css         # Styling
    └── app.js             # Frontend logic
```

## API Endpoints

`provider` is one of the ids returned by `GET /api/providers` (`anthropic`, `gemini`, `groq`, `qwen`, `gptoss20b`, `grok`, `gpt61`, `deepseek`, `kimi`, `openrouter`) and defaults to `anthropic`. `model` is only used with `openrouter`, where it is the OpenRouter model id.

### POST `/api/generate-test-cases`
Generate test cases from a user story

**Request Body:**
```json
{
  "userStory": "Your user story text",
  "schema": "Optional custom schema",
  "preferences": "Optional preferences",
  "provider": "anthropic",
  "model": "Optional, OpenRouter model id"
}
```

**Response:**
```json
{
  "success": true,
  "testCases": "Generated test cases (JSON array as text)",
  "model": "claude-haiku-5-5",
  "modelName": "Claude Haiku 5.5",
  "provider": "Anthropic",
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 5678
  }
}
```

### POST `/api/generate-bug-report`
Generate one bug report from an issue description

**Request Body:**
```json
{
  "issue": "Description of the issue",
  "preferences": "Optional preferences",
  "provider": "anthropic",
  "model": "Optional, OpenRouter model id"
}
```

**Response:** same shape as above, with the bug report JSON (as text) in `report` instead of `testCases`.

### GET `/api/providers`
List the models whose provider API key is configured

**Response:**
```json
{
  "providers": [
    {
      "id": "groq",
      "name": "GPT-OSS 120B",
      "provider": "Groq",
      "description": "Free & ultra-fast flagship",
      "available": true,
      "free": true
    }
  ]
}
```

### GET `/api/openrouter/models`
List OpenRouter text models for the model picker (cached for one hour). Prices are USD per 1M tokens.

**Response:**
```json
{
  "models": [
    {
      "id": "moonshotai/kimi-k3",
      "name": "MoonshotAI: Kimi K3",
      "contextLength": 1048576,
      "inputPrice": 0.45,
      "outputPrice": 15
    }
  ]
}
```

### POST `/api/clickup/fetch-task`
Fetch a user story from a ClickUp task

**Request Body:**
```json
{
  "taskId": "86a179p6f or TASK-123",
  "apiToken": "your_clickup_api_token"
}
```

**Response:**
```json
{
  "success": true,
  "userStory": "Fetched user story content",
  "taskName": "Task name",
  "taskId": "task_id",
  "taskUrl": "https://app.clickup.com/..."
}
```

### POST `/api/upload-story`
Upload a markdown file containing a user story

**Request:**
- Content-Type: `multipart/form-data`
- Field name: `file`
- File type: `.md` (max 5MB)

**Response:**
```json
{
  "success": true,
  "userStory": "File content as text",
  "filename": "story.md"
}
```

### GET `/api/health`
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "models": {
    "anthropic": "claude-haiku-5-5",
    "gemini": "gemini-3.8-flash",
    "openrouter": null
  },
  "timestamp": "2026-10-15T..."
}
```

## Model Information

This application uses the most advanced models available as of **October 2026**:
- **Anthropic**: Claude Haiku 5.5 (`claude-haiku-5-5`)
- **Google**: Gemini 3.8 Flash (`gemini-3.8-flash`)
- **Groq** (*free*): GPT-OSS 120B (`openai/gpt-oss-120b`), GPT-OSS 20B (`openai/gpt-oss-20b`), Qwen 3.8 27B (`qwen/qwen3.8-27b`)
- **OpenRouter** (*needs credit*): GPT-6.1 Sol Pro (`openai/gpt-6.1-sol-pro`), DeepSeek V4.1 Flash (`deepseek/deepseek-v4.1-flash`), Kimi K3 (`moonshotai/kimi-k3`), plus a picker for any OpenRouter model
- **xAI**: Grok 4.7 (`grok-4.7`) - direct with `XAI_API_KEY`, otherwise via OpenRouter (`x-ai/grok-4.7`)

## Cost Considerations

- The Groq models (GPT-OSS 120B, GPT-OSS 20B, Qwen 3.8) are free
- Other providers bill per token at their own rates; check each provider's pricing page. The OpenRouter picker shows each model's input/output price per 1M tokens
- A typical generation uses about 500-1,500 input tokens and 2,000-5,000 output tokens; the token usage of every run is shown under the result

## Troubleshooting

**"API key not configured" error or a provider is missing from the list:**
- Ensure your `.env` file exists and contains a valid key for that provider
- Restart the server after editing `.env`

**402 / 429 / 503 errors:**
- 402: the provider account is out of credit (common with OpenRouter)
- 429: rate limited; wait and retry, or switch models
- 503: the provider is overloaded; retry shortly

**Port Already in Use:**
- Change the `PORT` in `.env` to a different number (e.g., 3001)

**Dependencies Installation Failed:**
- Check that you are on Node.js 22 or higher (`node -v`)
- Delete the `node_modules` folder and run `npm install` again

## Development

To modify the application:

1. **Backend**: Edit `server.js` for API logic
2. **Frontend**: Edit files in `public/` directory
3. **Styling**: Modify `public/styles.css`
4. **Client Logic**: Update `public/app.js`

## License

MIT

## Support

For issues or questions:
- Check the troubleshooting section above
- Review the API documentation of the provider you use (e.g. https://docs.anthropic.com/)
- Ensure you're using Node.js 22 or higher

---

Built with ❤️ using the latest AI models available in 2026
