// ===================================
// AI QA Assistant - App Logic
// ===================================

// DOM Elements
const userStoryInput = document.getElementById('userStory');
const preferencesInput = document.getElementById('preferences');
const generateBtn = document.getElementById('generateBtn');
const outputSection = document.getElementById('outputSection');
const outputFormatted = document.getElementById('outputFormatted');
const outputRaw = document.getElementById('outputRaw');
const outputTable = document.getElementById('outputTable');
const usageInfo = document.getElementById('usageInfo');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const downloadMdBtn = document.getElementById('downloadMdBtn');
const downloadCsvBtn = document.getElementById('downloadCsvBtn');
const notification = document.getElementById('notification');
const charCount = document.getElementById('charCount');

// Method cards (new tab system)
const methodCards = document.querySelectorAll('.method-card');
const tabContents = document.querySelectorAll('.tab-content');

// ClickUp elements
const clickupToken = document.getElementById('clickupToken');
const clickupTaskId = document.getElementById('clickupTaskId');
const fetchClickUpBtn = document.getElementById('fetchClickUpBtn');
const clickupPreview = document.getElementById('clickupPreview');
const clickupStoryPreview = document.getElementById('clickupStoryPreview');
const clickupTokenSetup = document.getElementById('clickupTokenSetup');
const clickupTokenSaved = document.getElementById('clickupTokenSaved');
const saveTokenCheckbox = document.getElementById('saveToken');
const changeTokenBtn = document.getElementById('changeTokenBtn');
const removeTokenBtn = document.getElementById('removeTokenBtn');
const togglePasswordBtn = document.getElementById('togglePassword');

// Token storage key
const CLICKUP_TOKEN_KEY = 'clickup_api_token';

// File upload elements
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const uploadArea = document.getElementById('uploadArea');
const filePreview = document.getElementById('filePreview');
const fileInfo = document.getElementById('fileInfo');
const fileStoryPreview = document.getElementById('fileStoryPreview');

// Provider elements
const providerOptions = document.getElementById('providerOptions');
const providerNote = document.getElementById('providerNote');
const subtitle = document.getElementById('subtitle');
const openrouterPicker = document.getElementById('openrouterPicker');
const openrouterModel = document.getElementById('openrouterModel');
const openrouterModelList = document.getElementById('openrouterModelList');
const openrouterModelHint = document.getElementById('openrouterModelHint');

// Output tabs
const outputTabs = document.querySelectorAll('.output-tab');
const outputViews = { formatted: outputFormatted, table: outputTable, raw: outputRaw };

// Workflow steps
const workflowSteps = document.querySelectorAll('.step');
const stepConnectors = document.querySelectorAll('.step-connector');

// Mode switch (Test Cases / Bug Report)
const modeOptions = document.querySelectorAll('.mode-option');

// Example button
const loadExampleBtn = document.getElementById('loadExampleBtn');

let lastGeneratedText = '';
let currentUserStory = '';
let availableProviders = [];
let openRouterModels = null;
let currentMode = 'testCases';
let lastMode = 'testCases';
let lastBugReport = null;
let lastTestSuite = null;

// Example user story
const exampleUserStory = `As a registered user,
I want to be able to reset my password via email
So that I can regain access to my account if I forget my password.

Acceptance Criteria:
- User can request password reset from login page
- System sends email with reset link within 2 minutes
- Reset link expires after 24 hours
- Password must meet security requirements (8+ chars, 1 uppercase, 1 number)
- User receives confirmation after successful password change
- Previous sessions are invalidated after password reset

Business Rules:
- Maximum 3 reset attempts per hour
- Link can only be used once
- Email notification sent for successful reset`;

// Example bug description
const exampleBugDescription = `Acme Shop web app on Staging, Chrome on macOS.

On the login page, after entering a registered email with a wrong password 5 times in a row,
the account should be locked for 15 minutes (story AUTH-112). Instead I can keep trying with
no limit, and then log in with the right password straight away.

Request: POST https://staging.acme-shop.example/api/v1/auth/login
Body: {"email": "qa.user@example.com", "password": "Wrong#123"}
Response on the 6th attempt: 401 {"message": "Invalid credentials"}`;

// ===================================
// Event Listeners
// ===================================

generateBtn.addEventListener('click', generateOutput);
copyBtn.addEventListener('click', copyToClipboard);
downloadBtn.addEventListener('click', downloadJSON);
downloadMdBtn.addEventListener('click', downloadMarkdown);
downloadCsvBtn.addEventListener('click', downloadCSV);

// Method card switching (new tab system)
methodCards.forEach(card => {
    card.addEventListener('click', () => switchTab(card.dataset.tab));
});

// ClickUp events
fetchClickUpBtn.addEventListener('click', fetchClickUpTask);
changeTokenBtn.addEventListener('click', showTokenInput);
removeTokenBtn.addEventListener('click', removeClickUpToken);

// Toggle password visibility
if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
        const type = clickupToken.type === 'password' ? 'text' : 'password';
        clickupToken.type = type;
        togglePasswordBtn.innerHTML = type === 'password'
            ? '<i class="fas fa-eye"></i>'
            : '<i class="fas fa-eye-slash"></i>';
    });
}

// File upload events
browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
});
fileInput.addEventListener('change', handleFileSelect);
uploadArea.addEventListener('click', () => fileInput.click());

// Drag and drop events
uploadArea.addEventListener('dragover', handleDragOver);
uploadArea.addEventListener('dragleave', handleDragLeave);
uploadArea.addEventListener('drop', handleFileDrop);

// Character count
userStoryInput.addEventListener('input', updateCharCount);

// Load example
if (loadExampleBtn) {
    loadExampleBtn.addEventListener('click', loadExample);
}

// Mode switching
modeOptions.forEach(option => {
    option.addEventListener('click', () => switchMode(option.dataset.mode));
});

// Output tab switching
outputTabs.forEach(tab => {
    tab.addEventListener('click', () => switchOutputView(tab.dataset.view));
});

// Provider change listener
document.querySelectorAll('input[name="provider"]').forEach(radio => {
    radio.addEventListener('change', () => {
        updateSubtitle();
        updateOpenRouterPicker();
    });
});
openrouterModel.addEventListener('input', updateOpenRouterHint);

// Highlight the clicked cell in the table view, like a spreadsheet
outputTable.addEventListener('click', (event) => {
    const cell = event.target.closest('td');
    if (!cell) return;
    outputTable.querySelector('td.selected')?.classList.remove('selected');
    cell.classList.add('selected');
});

// ===================================
// Tab Switching
// ===================================

function switchTab(tabName) {
    // Update method cards
    methodCards.forEach(card => {
        card.classList.toggle('active', card.dataset.tab === tabName);
    });

    // Update tab contents
    tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
}

// ===================================
// Output View Switching
// ===================================

// Swaps every mode-specific label, placeholder and card between the two modes.
// Elements keep their test-case text in the markup and the bug report text in
// data-bug-report / data-bug-report-placeholder; data-only-mode shows one mode only.
function switchMode(mode) {
    currentMode = mode;
    const bugMode = mode === 'bugReport';

    modeOptions.forEach(option => {
        const active = option.dataset.mode === mode;
        option.classList.toggle('active', active);
        option.setAttribute('aria-selected', String(active));
    });

    document.querySelectorAll('[data-bug-report]').forEach(element => {
        element.dataset.testCases ??= element.textContent;
        element.textContent = bugMode ? element.dataset.bugReport : element.dataset.testCases;
    });

    document.querySelectorAll('[data-bug-report-placeholder]').forEach(element => {
        element.dataset.testCasesPlaceholder ??= element.placeholder;
        element.placeholder = bugMode ? element.dataset.bugReportPlaceholder : element.dataset.testCasesPlaceholder;
    });

    document.querySelectorAll('[data-only-mode]').forEach(element => {
        element.hidden = element.dataset.onlyMode !== mode;
    });

    // The current output belongs to the other mode
    outputSection.style.display = 'none';
}

function switchOutputView(view) {
    outputTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === view);
    });

    Object.entries(outputViews).forEach(([name, element]) => {
        element.style.display = name === view ? 'block' : 'none';
    });
}

// ===================================
// Workflow Progress
// ===================================

function updateWorkflowStep(stepNumber) {
    workflowSteps.forEach((step, index) => {
        const stepNum = index + 1;
        step.classList.remove('active', 'completed');

        if (stepNum < stepNumber) {
            step.classList.add('completed');
        } else if (stepNum === stepNumber) {
            step.classList.add('active');
        }
    });

    stepConnectors.forEach((connector, index) => {
        connector.classList.toggle('active', index < stepNumber - 1);
    });
}

// ===================================
// Character Count
// ===================================

function updateCharCount() {
    const count = userStoryInput.value.length;
    charCount.textContent = `${count.toLocaleString()} characters`;
}

// ===================================
// Load Example
// ===================================

function loadExample() {
    const bugMode = currentMode === 'bugReport';
    userStoryInput.value = bugMode ? exampleBugDescription : exampleUserStory;
    updateCharCount();
    showNotification(bugMode ? 'Example bug description loaded!' : 'Example user story loaded!', 'success');
    updateWorkflowStep(2);
}

// ===================================
// ClickUp Token Management
// ===================================

function getSavedClickUpToken() {
    return localStorage.getItem(CLICKUP_TOKEN_KEY);
}

function saveClickUpToken(token) {
    localStorage.setItem(CLICKUP_TOKEN_KEY, token);
}

function removeClickUpToken() {
    localStorage.removeItem(CLICKUP_TOKEN_KEY);
    showTokenInput();
    clickupToken.value = '';
    showNotification('Token removed successfully', 'success');
}

function showTokenInput() {
    clickupTokenSetup.style.display = 'block';
    clickupTokenSaved.style.display = 'none';
    clickupToken.value = '';
    clickupToken.focus();
}

function showTokenSaved() {
    clickupTokenSetup.style.display = 'none';
    clickupTokenSaved.style.display = 'block';
}

function initClickUpTokenUI() {
    const savedToken = getSavedClickUpToken();
    if (savedToken) {
        showTokenSaved();
    } else {
        showTokenInput();
    }
}

// ===================================
// ClickUp Fetch
// ===================================

async function fetchClickUpTask() {
    let token = getSavedClickUpToken();
    const inputToken = clickupToken.value.trim();
    const taskId = clickupTaskId.value.trim();

    if (!token && inputToken) {
        token = inputToken;
    }

    if (!token) {
        showNotification('Please enter your ClickUp API token', 'error');
        showTokenInput();
        return;
    }

    if (!taskId) {
        showNotification('Please enter a Task ID', 'error');
        clickupTaskId.focus();
        return;
    }

    // Show loading
    const btnText = fetchClickUpBtn.querySelector('.btn-text');
    const loader = fetchClickUpBtn.querySelector('.loader');
    fetchClickUpBtn.disabled = true;
    btnText.style.display = 'none';
    loader.style.display = 'block';

    try {
        const response = await fetch('/api/clickup/fetch-task', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                taskId: taskId,
                apiToken: token
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch task');
        }

        // Save token if checkbox is checked
        if (inputToken && saveTokenCheckbox.checked) {
            saveClickUpToken(inputToken);
            showTokenSaved();
        }

        // Display the fetched story
        currentUserStory = data.userStory;
        clickupStoryPreview.textContent = data.userStory;
        clickupPreview.style.display = 'block';
        userStoryInput.value = data.userStory;
        updateCharCount();

        showNotification('Task fetched successfully!', 'success');
        updateWorkflowStep(2);

    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message || 'Failed to fetch task', 'error');

        if (error.message && error.message.includes('401')) {
            removeClickUpToken();
            showNotification('Invalid token. Please enter a valid API token.', 'error');
        }
    } finally {
        fetchClickUpBtn.disabled = false;
        btnText.style.display = 'inline';
        loader.style.display = 'none';
    }
}

// ===================================
// File Upload
// ===================================

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');
}

async function handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        await uploadFile(files[0]);
    }
}

async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        await uploadFile(file);
    }
}

async function uploadFile(file) {
    if (!file.name.endsWith('.md')) {
        showNotification('Please upload a markdown (.md) file', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/upload-story', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to upload file');
        }

        currentUserStory = data.userStory;
        fileInfo.innerHTML = `
            <i class="fas fa-file-alt" style="color: var(--primary-color);"></i>
            <strong>${data.filename}</strong>
            <span>${(file.size / 1024).toFixed(2)} KB</span>
        `;
        fileStoryPreview.textContent = data.userStory;
        filePreview.style.display = 'block';
        userStoryInput.value = data.userStory;
        updateCharCount();

        showNotification('File uploaded successfully!', 'success');
        updateWorkflowStep(2);

    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message || 'Failed to upload file', 'error');
    }
}

// ===================================
// Provider Selection
// ===================================

function getSelectedProvider() {
    const selected = document.querySelector('input[name="provider"]:checked');
    return selected ? selected.value : 'anthropic';
}

function updateSubtitle() {
    const selectedProviderId = getSelectedProvider();
    const provider = availableProviders.find(p => p.id === selectedProviderId);
    
    if (provider) {
        subtitle.textContent = `Powered by ${provider.name} (${provider.provider})`;
    } else {
        subtitle.textContent = 'Test cases from user stories, bug reports from issue descriptions';
    }
}

async function updateOpenRouterPicker() {
    const show = getSelectedProvider() === 'openrouter';
    openrouterPicker.hidden = !show;
    if (show && !openRouterModels) {
        await loadOpenRouterModels();
    }
}

async function loadOpenRouterModels() {
    try {
        const response = await fetch('/api/openrouter/models');
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || data.error);
        }
        openRouterModels = data.models;
        openrouterModelList.replaceChildren(
            ...openRouterModels.map(model => new Option(`${model.name} · ${formatModelPrice(model)}`, model.id))
        );
        updateOpenRouterHint();
    } catch (error) {
        console.error('Failed to load OpenRouter models:', error);
        openrouterModelHint.textContent = 'Could not load the OpenRouter model list';
    }
}

function formatModelPrice(model) {
    // Negative or missing prices mean the cost varies per request
    if (!(model.inputPrice >= 0) || !(model.outputPrice >= 0)) return 'variable price';
    if (model.inputPrice === 0 && model.outputPrice === 0) return 'free';
    return `$${model.inputPrice.toFixed(2)} in / $${model.outputPrice.toFixed(2)} out per 1M tokens`;
}

function updateOpenRouterHint() {
    if (!openRouterModels) return;
    const model = openRouterModels.find(m => m.id === openrouterModel.value.trim());
    if (model) {
        const context = model.contextLength ? ` · ${model.contextLength.toLocaleString()} token context` : '';
        openrouterModelHint.textContent = `${model.name} · ${formatModelPrice(model)}${context}`;
    } else {
        openrouterModelHint.textContent = `${openRouterModels.length} models available. Type to search; add ":free" for free models.`;
    }
}

// ===================================
// Test Case Generation
// ===================================

async function generateOutput() {
    const userStory = userStoryInput.value.trim();
    const provider = getSelectedProvider();
    const openRouterModelId = openrouterModel.value.trim();
    const mode = currentMode;
    const bugMode = mode === 'bugReport';

    if (!userStory) {
        showNotification(bugMode ? 'Please describe the bug' : 'Please enter a user story', 'error');
        return;
    }

    if (provider === 'openrouter' && !openRouterModelId) {
        showNotification('Please choose an OpenRouter model', 'error');
        return;
    }

    // Update workflow
    updateWorkflowStep(3);

    // Show loading state
    generateBtn.disabled = true;
    document.querySelector('#generateBtn .btn-text').style.display = 'none';
    document.querySelector('#generateBtn .loader').style.display = 'block';
    outputSection.style.display = 'none';

    try {
        const model = provider === 'openrouter' ? openRouterModelId : undefined;
        const preferences = preferencesInput.value.trim() || null;
        const response = await fetch(bugMode ? '/api/generate-bug-report' : '/api/generate-test-cases', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bugMode
                ? { issue: userStory, preferences, provider, model }
                : { userStory, preferences, provider, model })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || (bugMode ? 'Failed to generate bug report' : 'Failed to generate test cases'));
        }

        // Store and display results
        lastMode = mode;
        if (bugMode) {
            lastGeneratedText = data.report;
            displayBugReport(data.report, data.truncated);
        } else {
            lastGeneratedText = data.testCases;
            displayTestCases(data.testCases, data.truncated);
        }
        displayUsageInfo(data.usage, data.modelName, data.provider);
        outputSection.style.display = 'block';

        // Update workflow
        updateWorkflowStep(4);

        // Scroll to output
        outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        showNotification(`${bugMode ? 'Bug report' : 'Test cases'} generated with ${data.modelName}!`, 'success');

    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message || 'Generation failed', 'error');
        updateWorkflowStep(2);
    } finally {
        generateBtn.disabled = false;
        document.querySelector('#generateBtn .btn-text').style.display = 'inline';
        document.querySelector('#generateBtn .loader').style.display = 'none';
    }
}

// ===================================
// Display Test Cases
// ===================================

// Models often wrap the JSON in a ```json fence or add a sentence around it,
// so try the whole text, then the fenced block, then the outermost [...] / {...}.
// Returns the parsed value, or null when no JSON can be found.
function parseModelJson(text) {
    const candidates = [text];
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) candidates.push(fenced[1]);
    const start = text.search(/[[{]/);
    const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
    if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (e) {
            // Not JSON; try the next candidate
        }
    }
    return null;
}

// Models name the same field differently (testCaseId, test_case_id, "Test Case ID"),
// so match keys ignoring case, spaces and punctuation.
const normalizeKey = key => key.toLowerCase().replace(/[^a-z0-9]/g, '');

function field(testCase, ...names) {
    const wanted = names.map(normalizeKey);
    const key = Object.keys(testCase).find(k => wanted.includes(normalizeKey(k)));
    return key === undefined ? undefined : testCase[key];
}

// Shown when a reply has no valid JSON: the text as-is, plus a notice saying why
function displayUnparsedReply(text, truncated) {
    const reason = truncated
        ? 'The reply hit the model\'s output limit and was cut off, so it isn\'t complete JSON. Try a model with a larger output limit, such as Claude, or split the story into smaller parts.'
        : 'The model\'s reply isn\'t valid JSON, so it can\'t be shown as a table. Models occasionally write invalid JSON; generating again usually fixes it.';
    const notice = `<p class="output-notice"><i class="fas fa-exclamation-triangle"></i> ${reason}</p>`;
    outputRaw.textContent = text;
    outputFormatted.innerHTML = `${notice}<div class="story-preview">${escapeHtml(text)}</div>`;
    outputTable.innerHTML = notice;
}

// ===================================
// Test Cases (user-story-test-case-generator skill format)
// ===================================

// The skill's 12 template columns in order, plus the kept Priority column after Type of Test Case
const TEST_CASE_COLUMNS = [
    ['testCaseId', 'Test Case ID'],
    ['title', 'Title'],
    ['moduleFeature', 'Module / Feature'],
    ['preconditions', 'Preconditions'],
    ['tags', 'Tags'],
    ['steps', 'Steps'],
    ['results', 'Results'],
    ['typeOfTestCase', 'Type of Test Case'],
    ['priority', 'Priority'],
    ['estimate', 'Estimate'],
    ['owner', 'Owner'],
    ['automationStatus', 'Automation Status'],
    ['state', 'State']
];

const toText = value => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
const toList = value => Array.isArray(value) ? value : value ? [value] : [];
const joinText = (value, separator) => Array.isArray(value) ? value.map(toText).join(separator) : toText(value);
// The layout numbers the steps itself, so drop any numbering the model added
const stripNumbering = text => text.replace(/^\s*\d+[.)]\s*/, '');

// Steps arrive as [{step, result}] pairs, or as plain strings with a separate results list
function normalizeSteps(steps, results) {
    const resultList = toList(results);
    return toList(steps).map((item, i) => {
        if (item && typeof item === 'object') {
            return {
                step: stripNumbering(toText(field(item, 'step', 'action', 'description'))),
                result: toText(field(item, 'result', 'expectedResult', 'expected'))
            };
        }
        return { step: stripNumbering(toText(item)), result: toText(resultList[i]) };
    });
}

// Maps one test case from the model onto the template's fields, tolerating renamed keys
function normalizeTestCase(raw, index) {
    return {
        testCaseId: toText(field(raw, 'testCaseId', 'id')) || `TC-${String(index + 1).padStart(3, '0')}`,
        title: toText(field(raw, 'title', 'testCaseTitle', 'name')),
        moduleFeature: toText(field(raw, 'moduleFeature', 'module', 'feature')),
        preconditions: joinText(field(raw, 'preconditions'), '; '),
        tags: joinText(field(raw, 'tags'), ', '),
        steps: normalizeSteps(field(raw, 'steps', 'testSteps'), field(raw, 'results', 'expectedResults', 'expectedResult')),
        typeOfTestCase: toText(field(raw, 'typeOfTestCase', 'testType', 'type')),
        priority: toText(field(raw, 'priority')),
        estimate: toText(field(raw, 'estimate')),
        owner: toText(field(raw, 'owner')),
        automationStatus: toText(field(raw, 'automationStatus')),
        state: toText(field(raw, 'state'))
    };
}

function normalizeAnalysis(raw) {
    const analysis = raw && typeof raw === 'object' ? raw : {};
    return {
        storyTitle: toText(field(analysis, 'storyTitle', 'title')),
        requirements: toList(field(analysis, 'requirementInventory', 'requirements')).map((item, i) =>
            item && typeof item === 'object'
                ? {
                    id: toText(field(item, 'id')) || `R${i + 1}`,
                    requirement: toText(field(item, 'requirement', 'description', 'text')),
                    source: toText(field(item, 'source'))
                }
                : { id: `R${i + 1}`, requirement: toText(item), source: '' }),
        assumptions: toList(field(analysis, 'assumptions')).map(toText),
        openQuestions: toList(field(analysis, 'openQuestions', 'ambiguities')).map(toText),
        risks: toList(field(analysis, 'risks', 'missingRequirements')).map(toText)
    };
}

// Returns {analysis, testCases}, or null when the reply has no usable JSON
function parseTestSuite(text) {
    const parsed = parseModelJson(text);
    if (!parsed || typeof parsed !== 'object') return null;
    const rawCases = Array.isArray(parsed) ? parsed : field(parsed, 'testCases');
    if (!Array.isArray(rawCases)) return null;
    return {
        analysis: normalizeAnalysis(Array.isArray(parsed) ? null : field(parsed, 'analysis')),
        testCases: rawCases.filter(tc => tc && typeof tc === 'object').map(normalizeTestCase)
    };
}

// "3m", "1h 30m", "5 min" -> minutes
function estimateMinutes(estimate) {
    const hours = estimate.match(/(\d+(?:\.\d+)?)\s*h/i);
    const minutes = estimate.match(/(\d+(?:\.\d+)?)\s*m/i);
    if (hours || minutes) {
        return (hours ? parseFloat(hours[1]) * 60 : 0) + (minutes ? parseFloat(minutes[1]) : 0);
    }
    return parseFloat(estimate) || 0;
}

// Case count, coverage by type, and the skill's time estimate:
// the summed estimates × a 1.5 junior buffer, rounded up to 5 minutes
function suiteSummary(suite) {
    const coverage = {};
    suite.testCases.forEach(tc => {
        const type = tc.typeOfTestCase || 'Unspecified';
        coverage[type] = (coverage[type] || 0) + 1;
    });
    const rawMinutes = Math.round(suite.testCases.reduce((sum, tc) => sum + estimateMinutes(tc.estimate), 0));
    return {
        cases: suite.testCases.length,
        coverage,
        rawMinutes,
        timeEstimate: Math.ceil(rawMinutes * 1.5 / 5) * 5
    };
}

function renderAnalysisHtml(suite) {
    const { analysis } = suite;
    const summary = suiteSummary(suite);
    const list = (items, tag = 'ul') => items.length
        ? `<${tag}>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>`
        : '<p class="analysis-empty">None noted.</p>';
    const requirements = analysis.requirements.length
        ? `<table class="analysis-requirements">
                <thead><tr><th>ID</th><th>Requirement</th><th>Source</th></tr></thead>
                <tbody>${analysis.requirements.map(r => `
                    <tr><td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.requirement)}</td><td>${escapeHtml(r.source)}</td></tr>
                `).join('')}</tbody>
            </table>`
        : '<p class="analysis-empty">None listed.</p>';
    const coverage = Object.entries(summary.coverage)
        .map(([type, count]) => `<span class="coverage-chip">${escapeHtml(type)} <strong>${count}</strong></span>`)
        .join('');

    // Collapsed by default so the test cases are visible first
    return `
        <details class="analysis">
            <summary>
                <span class="analysis-heading">Part 1: Analysis${analysis.storyTitle ? ` · ${escapeHtml(analysis.storyTitle)}` : ''}</span>
                <span class="analysis-stats">${analysis.requirements.length} requirements · ${analysis.openQuestions.length} open questions · ${summary.cases} cases · estimate ${summary.timeEstimate}m</span>
            </summary>
            <h4>Requirement inventory</h4>${requirements}
            <h4>Assumptions made</h4>${list(analysis.assumptions)}
            <h4>Ambiguities &amp; open questions</h4>${list(analysis.openQuestions, 'ol')}
            <h4>Missing requirements &amp; risks</h4>${list(analysis.risks)}
            <h4>Coverage summary</h4><div class="coverage-chips">${coverage}</div>
            <p class="analysis-time">Raw estimate ${summary.rawMinutes}m · time estimate ${summary.timeEstimate}m (×1.5 junior buffer, rounded up to 5m)</p>
        </details>
    `;
}

function renderTestCasesHtml(suite) {
    const rows = suite.testCases.map(tc => {
        const steps = tc.steps.length
            ? `<ol class="table-steps">${tc.steps.map(s => `
                <li>${escapeHtml(s.step)}${s.result ? `<span class="step-result">→ ${escapeHtml(s.result)}</span>` : ''}</li>
            `).join('')}</ol>`
            : '-';
        return `
            <tr>
                <td><span class="table-id">${escapeHtml(tc.testCaseId)}</span></td>
                <td>
                    <div class="table-title">${escapeHtml(tc.title)}</div>
                    ${tc.moduleFeature ? `<div class="table-meta">${escapeHtml(tc.moduleFeature)}</div>` : ''}
                    ${tc.tags ? `<div class="table-tags">${escapeHtml(tc.tags)}</div>` : ''}
                </td>
                <td>${tc.priority ? `<span class="table-priority ${escapeHtml(tc.priority.toLowerCase())}">${escapeHtml(tc.priority)}</span>` : '-'}</td>
                <td><span class="table-type">${escapeHtml(tc.typeOfTestCase || '-')}</span></td>
                <td><span class="table-cell-content">${escapeHtml(tc.preconditions || '-')}</span></td>
                <td>${steps}</td>
                <td>${escapeHtml(tc.estimate || '-')}</td>
            </tr>
        `;
    }).join('');

    return `
        <h3 class="suite-heading">Part 2: Test cases</h3>
        <div class="table-container">
            <table class="test-cases-table">
                <thead>
                    <tr><th>ID</th><th>Title</th><th>Priority</th><th>Type</th><th>Preconditions</th><th>Steps → Results</th><th>Estimate</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

// The template's multi-row layout: a case's first row holds its metadata, step 1 and
// result 1; each later row holds only the next step and its result
function testCaseRows(tc) {
    const steps = tc.steps.length ? tc.steps : [{ step: '', result: '' }];
    return steps.map((s, i) => TEST_CASE_COLUMNS.map(([key]) => {
        if (key === 'steps') return s.step ? `${i + 1}. ${s.step}` : '';
        if (key === 'results') return s.result;
        return i === 0 ? tc[key] : '';
    }));
}

function displayTestCaseSheet(suite) {
    const blocks = suite.testCases.map(testCaseRows);
    const blockStarts = new Set();
    let row = 0;
    blocks.forEach(block => {
        blockStarts.add(row);
        row += block.length;
    });
    renderSheet(
        TEST_CASE_COLUMNS.map(([, label]) => label),
        blocks.flat(),
        'sheet-test-cases',
        index => blockStarts.has(index) ? 'sheet-block-start' : ''
    );
}

function displayTestCases(text, truncated) {
    lastTestSuite = parseTestSuite(text);

    if (!lastTestSuite) {
        displayUnparsedReply(text, truncated);
        return;
    }

    outputRaw.textContent = JSON.stringify(lastTestSuite, null, 2);
    outputFormatted.innerHTML = renderAnalysisHtml(lastTestSuite) + renderTestCasesHtml(lastTestSuite);
    displayTestCaseSheet(lastTestSuite);
}

// The skill's two-part .md layout: a header, Part 1 (analysis), Part 2 (the template table)
function testSuiteMarkdown(suite) {
    const { analysis } = suite;
    const summary = suiteSummary(suite);
    const cell = value => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
    const tableRow = cells => `| ${cells.map(cell).join(' | ')} |`;
    const bullets = (items, numbered = false) => items.length
        ? items.map((item, i) => `${numbered ? `${i + 1}.` : '-'} ${item}`).join('\n')
        : '- None noted.';

    // The most common module names the whole suite
    const moduleCounts = {};
    suite.testCases.forEach(tc => {
        if (tc.moduleFeature) moduleCounts[tc.moduleFeature] = (moduleCounts[tc.moduleFeature] || 0) + 1;
    });
    const moduleFeature = Object.entries(moduleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const owner = suite.testCases.find(tc => tc.owner)?.owner || '';
    const headers = TEST_CASE_COLUMNS.map(([, label]) => label);

    return [
        `# Test Cases${analysis.storyTitle ? ` — ${analysis.storyTitle}` : ''}`,
        '',
        moduleFeature ? `**Module / Feature:** ${moduleFeature}` : '',
        `${owner ? `**Owner:** ${owner} · ` : ''}**Cases:** ${summary.cases} · **Raw estimate sum:** ${summary.rawMinutes}m · **Time Estimate:** ${summary.timeEstimate}m (${summary.rawMinutes} × 1.5 junior buffer, rounded up to 5m)`,
        '',
        '---',
        '',
        '## Part 1 — Analysis',
        '',
        '### Requirement inventory',
        '',
        tableRow(['ID', 'Requirement', 'Source']),
        '|----|-------------|--------|',
        ...analysis.requirements.map(r => tableRow([r.id, r.requirement, r.source])),
        '',
        '### Assumptions made',
        '',
        bullets(analysis.assumptions),
        '',
        '### Ambiguities & open questions',
        '',
        bullets(analysis.openQuestions, true),
        '',
        '### Missing requirements & risks',
        '',
        bullets(analysis.risks),
        '',
        '### Coverage summary',
        '',
        Object.entries(summary.coverage).map(([type, count]) => `${type} ${count}`).join(', '),
        '',
        '---',
        '',
        '## Part 2 — Test cases',
        '',
        tableRow(headers),
        `|${headers.map(header => '-'.repeat(header.length + 2)).join('|')}|`,
        ...suite.testCases.flatMap(testCaseRows).map(tableRow),
        ''
    ].filter((line, i, lines) => line !== '' || lines[i - 1] !== '').join('\n');
}

function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===================================
// Table View (spreadsheet style)
// ===================================

// Spreadsheet-style grid: column letters, a header row, then numbered rows of text cells
function renderSheet(headers, rows, className = '', rowClass = () => '') {
    const letters = headers.map((_, i) => `<th>${columnLetter(i)}</th>`).join('');
    const headerCells = headers.map(header => `<th>${escapeHtml(header)}</th>`).join('');
    const bodyRows = rows.map((row, index) => `
        <tr class="${rowClass(index)}">
            <th class="sheet-row-number">${index + 1}</th>
            ${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}
        </tr>
    `).join('');

    outputTable.innerHTML = `
        <table class="sheet ${className}">
            <thead>
                <tr class="sheet-letters"><th class="sheet-corner"></th>${letters}</tr>
                <tr class="sheet-fields"><th class="sheet-corner"></th>${headerCells}</tr>
            </thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;
}

// 0 -> A, 25 -> Z, 26 -> AA
function columnLetter(index) {
    let letters = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    }
    return letters;
}

// ===================================
// Bug Report (bug-report-generator skill format)
// ===================================

// The model sets apiEvidence to this when a backend bug came with no request/response
const MISSING_EVIDENCE = 'MISSING';
const MISSING_EVIDENCE_TEXT = 'MISSING: this looks like a backend bug. Capture the failing request (a cURL, the request and response, or a Telescope link) and add it before filing.';

// Maps the model's JSON onto the skill's fields, tolerating renamed keys
function normalizeBugReport(raw) {
    const environment = field(raw, 'environment') || {};
    const steps = field(raw, 'stepsToReproduce', 'steps') || [];
    const evidence = field(raw, 'apiEvidence');
    return {
        title: String(field(raw, 'title') || ''),
        link: String(field(raw, 'link') || ''),
        environment: {
            appSystem: String(field(environment, 'appSystem', 'app') || ''),
            os: String(field(environment, 'os') || ''),
            browserClient: String(field(environment, 'browserClient', 'browser') || ''),
            testEnvironment: String(field(environment, 'testEnvironment') || '')
        },
        // The format numbers the steps itself, so drop any numbering the model added
        stepsToReproduce: (Array.isArray(steps) ? steps : [steps]).map(step => String(step).replace(/^\s*\d+[.)]\s*/, '')),
        actualResult: String(field(raw, 'actualResult') || ''),
        expectedResult: String(field(raw, 'expectedResult') || ''),
        apiEvidence: !evidence ? null : typeof evidence === 'string' ? evidence : JSON.stringify(evidence, null, 2),
        severity: String(field(raw, 'severity') || ''),
        priority: String(field(raw, 'priority') || '')
    };
}

const numberedSteps = report => report.stepsToReproduce.map((step, i) => `${i + 1}. ${step}`).join('\n');
const evidenceText = report => report.apiEvidence === MISSING_EVIDENCE ? MISSING_EVIDENCE_TEXT : report.apiEvidence;

// [label, value] pairs in the skill's order; API Evidence only for backend bugs
function bugReportFields(report) {
    const env = report.environment;
    const fields = [
        ['Title', report.title],
        ['Link', report.link],
        ['App/System', env.appSystem],
        ['OS', env.os],
        ['Browser/Client', env.browserClient],
        ['Test Environment', env.testEnvironment],
        ['Steps to Reproduce', numberedSteps(report)],
        ['Actual Result', report.actualResult],
        ['Expected Result', report.expectedResult]
    ];
    if (report.apiEvidence) fields.push(['API Evidence', evidenceText(report)]);
    fields.push(['Severity', report.severity], ['Priority', report.priority]);
    return fields;
}

// The skill's exact output format
function bugReportMarkdown(report) {
    const env = report.environment;
    const sections = [
        `**Title:** ${report.title}`,
        `**Link:** ${report.link}`,
        `**Environment:**\n- App/System: ${env.appSystem}\n- OS: ${env.os}\n- Browser/Client: ${env.browserClient}\n- Test Environment: ${env.testEnvironment}`,
        `**Steps to Reproduce:**\n${numberedSteps(report)}`,
        `**Actual Result:**\n${report.actualResult}`,
        `**Expected Result:**\n${report.expectedResult}`
    ];
    if (report.apiEvidence) sections.push(`**API Evidence:**\n${evidenceText(report)}`);
    sections.push(`**Severity:** ${report.severity}`, `**Priority:** ${report.priority}`);
    return sections.join('\n\n') + '\n';
}

function renderBugReportHtml(report) {
    const env = report.environment;
    const rating = (label, value) =>
        `<span class="table-priority ${escapeHtml(value.toLowerCase())}">${label}: ${escapeHtml(value)}</span>`;

    let evidence = '';
    if (report.apiEvidence === MISSING_EVIDENCE) {
        evidence = `<div class="bug-evidence-missing"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(MISSING_EVIDENCE_TEXT)}</div>`;
    } else if (report.apiEvidence) {
        evidence = `<pre class="bug-evidence">${escapeHtml(report.apiEvidence)}</pre>`;
    }

    return `
        <article class="bug-report">
            <h3 class="bug-title">${escapeHtml(report.title)}</h3>
            <div class="bug-ratings">${rating('Severity', report.severity)} ${rating('Priority', report.priority)}</div>
            <dl class="bug-fields">
                <dt>Link</dt>
                <dd>${escapeHtml(report.link)}</dd>
                <dt>Environment</dt>
                <dd><ul>
                    <li><strong>App/System:</strong> ${escapeHtml(env.appSystem)}</li>
                    <li><strong>OS:</strong> ${escapeHtml(env.os)}</li>
                    <li><strong>Browser/Client:</strong> ${escapeHtml(env.browserClient)}</li>
                    <li><strong>Test Environment:</strong> ${escapeHtml(env.testEnvironment)}</li>
                </ul></dd>
                <dt>Steps to Reproduce</dt>
                <dd><ol>${report.stepsToReproduce.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol></dd>
                <dt>Actual Result</dt>
                <dd>${escapeHtml(report.actualResult)}</dd>
                <dt>Expected Result</dt>
                <dd>${escapeHtml(report.expectedResult)}</dd>
                ${evidence ? `<dt>API Evidence</dt><dd>${evidence}</dd>` : ''}
            </dl>
        </article>
    `;
}

function displayBugReport(text, truncated) {
    const parsed = parseModelJson(text);
    lastBugReport = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? normalizeBugReport(parsed)
        : null;

    if (!lastBugReport) {
        displayUnparsedReply(text, truncated);
        return;
    }

    outputRaw.textContent = JSON.stringify(lastBugReport, null, 2);
    outputFormatted.innerHTML = renderBugReportHtml(lastBugReport);
    renderSheet(['Field', 'Value'], bugReportFields(lastBugReport), 'sheet-field-value');
}

// ===================================
// Display Usage Info
// ===================================

function displayUsageInfo(usage, modelName, provider) {
    usageInfo.innerHTML = `
        <span><strong>Provider:</strong> ${provider}</span>
        <span><strong>Model:</strong> ${modelName}</span>
        <span><strong>Input:</strong> ${usage.input_tokens.toLocaleString()} tokens</span>
        <span><strong>Output:</strong> ${usage.output_tokens.toLocaleString()} tokens</span>
        <span><strong>Total:</strong> ${(usage.input_tokens + usage.output_tokens).toLocaleString()} tokens</span>
    `;
}

// ===================================
// Export Functions
// ===================================

// Markdown in the skill's layout for the current result, or null when the reply wasn't valid JSON
function exportMarkdown() {
    if (lastMode === 'bugReport') return lastBugReport ? bugReportMarkdown(lastBugReport) : null;
    return lastTestSuite ? testSuiteMarkdown(lastTestSuite) : null;
}

const exportName = () => lastMode === 'bugReport' ? 'bug-report' : 'test-cases';

function showUnparsedExportError() {
    showNotification('This reply isn\'t valid JSON; copy it from the Raw JSON tab instead', 'error');
}

async function copyToClipboard() {
    try {
        const markdown = exportMarkdown();
        await navigator.clipboard.writeText(markdown ?? lastGeneratedText);
        showNotification(markdown ? 'Copied as Markdown!' : 'Copied to clipboard!', 'success');
    } catch (error) {
        showNotification('Failed to copy to clipboard', 'error');
    }
}

function downloadJSON() {
    const data = lastMode === 'bugReport' ? lastBugReport : lastTestSuite;
    if (!data) return showUnparsedExportError();
    downloadFile(JSON.stringify(data, null, 2), `${exportName()}.json`, 'application/json');
    showNotification('Downloaded as JSON!', 'success');
}

function downloadMarkdown() {
    const markdown = exportMarkdown();
    if (!markdown) return showUnparsedExportError();
    downloadFile(markdown, `${exportName()}.md`, 'text/markdown');
    showNotification('Downloaded as Markdown!', 'success');
}

function downloadCSV() {
    let rows;
    if (lastMode === 'bugReport') {
        if (!lastBugReport) return showUnparsedExportError();
        // One header row and one report row, ready for a spreadsheet or bug tracker import
        const fields = bugReportFields(lastBugReport);
        rows = [fields.map(([label]) => label), fields.map(([, value]) => value)];
    } else {
        if (!lastTestSuite) return showUnparsedExportError();
        // The template's multi-row layout, ready for test management import
        rows = [TEST_CASE_COLUMNS.map(([, label]) => label), ...lastTestSuite.testCases.flatMap(testCaseRows)];
    }
    // The BOM makes Excel read the file as UTF-8, so Arabic text survives
    const csv = '﻿' + rows.map(row => row.map(escapeCSV).join(',')).join('\n') + '\n';
    downloadFile(csv, `${exportName()}.csv`, 'text/csv;charset=utf-8;');
    showNotification('Downloaded as CSV!', 'success');
}

function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ===================================
// Notification
// ===================================

function showNotification(message, type = 'success') {
    const notificationContent = notification.querySelector('.notification-content');
    const notificationIcon = notification.querySelector('.notification-icon');
    const notificationMessage = notification.querySelector('.notification-message');

    notificationMessage.textContent = message;
    notification.className = 'notification show';

    if (type === 'error') {
        notification.classList.add('error');
        notificationIcon.className = 'notification-icon fas fa-exclamation-circle';
    } else {
        notificationIcon.className = 'notification-icon fas fa-check-circle';
    }

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// ===================================
// API Health & Providers
// ===================================

async function checkHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        console.log('API Health:', data);
    } catch (error) {
        console.error('API health check failed:', error);
    }
}

async function loadProviders() {
    try {
        const response = await fetch('/api/providers');
        const data = await response.json();
        availableProviders = data.providers;
        document.getElementById('modelCountBadge').textContent = `${availableProviders.length} AI Models`;

        // Update individual provider tiles with real names/descriptions
        availableProviders.forEach(provider => {
            const optionInput = document.querySelector(`input[name="provider"][value="${provider.id}"]`);
            if (optionInput) {
                const tile = optionInput.closest('.provider-option');
                if (tile) {
                    const nameEl = tile.querySelector('.provider-name');
                    const descEl = tile.querySelector('.provider-company');
                    if (nameEl) nameEl.textContent = provider.name;
                    if (descEl) descEl.textContent = `${provider.provider} - ${provider.description}`;
                    
                    // Enable/Disable based on availability
                    optionInput.disabled = false;
                    tile.querySelector('.provider-tile').style.opacity = '1';
                }
            }
        });

        // Disable options that are not available
        const allProviderInputs = document.querySelectorAll('input[name="provider"]');
        allProviderInputs.forEach(input => {
            const isAvailable = availableProviders.some(p => p.id === input.value);
            if (!isAvailable) {
                input.disabled = true;
                const tile = input.closest('.provider-option');
                if (tile) {
                    tile.querySelector('.provider-tile').style.opacity = '0.5';
                }
            }
        });

        // Update footer badges dynamically
        const footerPowered = document.querySelector('.footer-powered');
        if (footerPowered && availableProviders.length > 0) {
            let footerHtml = 'Powered by ';
            footerHtml += availableProviders.map(p => `<span class="provider-badge">${p.name}</span>`).join(' & ');
            footerPowered.innerHTML = footerHtml;
        }

        // Select first available provider if current selection is unavailable
        const currentSelected = document.querySelector('input[name="provider"]:checked');
        if (!currentSelected || currentSelected.disabled) {
            const firstAvailable = Array.from(allProviderInputs).find(input => !input.disabled);
            if (firstAvailable) {
                firstAvailable.checked = true;
            }
        }

        // Update notes
        const unconfigured = Array.from(allProviderInputs)
            .filter(input => input.disabled)
            .map(input => input.closest('.provider-option')?.querySelector('.provider-name')?.textContent)
            .filter(Boolean);
        const availableCount = availableProviders.length;

        if (availableCount === 0) {
            providerNote.innerHTML = '<span class="warning"><i class="fas fa-exclamation-triangle"></i> No providers configured</span>';
        } else if (unconfigured.length > 0) {
            providerNote.innerHTML = `<span class="warning"><i class="fas fa-exclamation-triangle"></i> Not configured: ${unconfigured.map(escapeHtml).join(', ')}</span>`;
        } else {
            providerNote.innerHTML = `<span style="color: var(--success-color);"><i class="fas fa-check-circle"></i> ${availableCount} model${availableCount > 1 ? 's' : ''} available</span>`;
        }

        updateOpenRouterPicker();
        updateSubtitle();

    } catch (error) {
        console.error('Failed to load providers:', error);
        providerNote.innerHTML = '<span class="warning"><i class="fas fa-exclamation-triangle"></i> Could not load provider information</span>';
    }
}

// ===================================
// Initialize
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    checkHealth();
    loadProviders();
    initClickUpTokenUI();
    updateCharCount();
    updateWorkflowStep(1);
    document.getElementById('copyrightYear').textContent = new Date().getFullYear();
});
