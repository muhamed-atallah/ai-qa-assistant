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
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const printReport = document.getElementById('printReport');
const notification = document.getElementById('notification');
const charCount = document.getElementById('charCount');

// Method cards (new tab system)
const methodCards = document.querySelectorAll('.method-card');
const tabContents = document.querySelectorAll('.tab-content');

// ClickUp elements
const clickupTaskId = document.getElementById('clickupTaskId');
const fetchClickUpBtn = document.getElementById('fetchClickUpBtn');
const clickupPreview = document.getElementById('clickupPreview');
const clickupStoryPreview = document.getElementById('clickupStoryPreview');

// Azure DevOps elements
const azureOrgUrl = document.getElementById('azureOrgUrl');
const azureWorkItemId = document.getElementById('azureWorkItemId');
const azureIncludeComments = document.getElementById('azureIncludeComments');
const fetchAzureBtn = document.getElementById('fetchAzureBtn');
const azurePreview = document.getElementById('azurePreview');
const azureItemInfo = document.getElementById('azureItemInfo');
const azureStoryPreview = document.getElementById('azureStoryPreview');

// Token storage keys
const CLICKUP_TOKEN_KEY = 'clickup_api_token';
const AZURE_TOKEN_KEY = 'azure_devops_token';
const AZURE_ORG_URL_KEY = 'azure_devops_org_url';

const clickupTokenField = createTokenField(document.getElementById('clickupTokenField'), CLICKUP_TOKEN_KEY);
const azureTokenField = createTokenField(document.getElementById('azureTokenField'), AZURE_TOKEN_KEY);

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
let currentWorkflowStep = 1;

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
// The checklist with the tester's Pass/Fail marks, saved so a reload doesn't lose a run
let checklistRun = null;

const MODE_KEY = 'qa_mode';
const CHECKLIST_RUN_KEY = 'qa_checklist_run';

// What each mode sends, where, and how it shows the reply
const GENERATORS = {
    testCases: {
        endpoint: '/api/generate-test-cases',
        inputField: 'userStory',
        noun: 'Test cases',
        fileName: 'test-cases',
        missingInput: 'Please enter a user story',
        show: data => {
            lastGeneratedText = data.testCases;
            displayTestCases(data.testCases, data.truncated);
        }
    },
    checklist: {
        endpoint: '/api/generate-checklist',
        inputField: 'userStory',
        noun: 'Checklist',
        fileName: 'checklist',
        missingInput: 'Please enter a user story',
        show: (data, story) => {
            lastGeneratedText = data.checklist;
            displayNewChecklist(data, story);
        }
    },
    bugReport: {
        endpoint: '/api/generate-bug-report',
        inputField: 'issue',
        noun: 'Bug report',
        fileName: 'bug-report',
        missingInput: 'Please describe the bug',
        show: data => {
            lastGeneratedText = data.report;
            displayBugReport(data.report, data.truncated);
        }
    }
};

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
downloadPdfBtn.addEventListener('click', downloadChecklistPdf);

// Method card switching (new tab system)
methodCards.forEach(card => {
    card.addEventListener('click', () => switchTab(card.dataset.tab));
});

// Import events
fetchClickUpBtn.addEventListener('click', fetchClickUpTask);
fetchAzureBtn.addEventListener('click', fetchAzureWorkItem);

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
        updateWorkflowStep(Math.max(currentWorkflowStep, 2));
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

// Checklist run: Pass/Fail buttons, notes, and the coverage and reset actions
outputFormatted.addEventListener('click', (event) => {
    const verdictButton = event.target.closest('.verdict-btn');
    if (verdictButton) {
        setCheckStatus(checkIndex(verdictButton), verdictButton.dataset.verdict);
        return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (actionButton?.dataset.action === 'cover-missing') coverMissingLines(actionButton);
    if (actionButton?.dataset.action === 'reset-run') resetChecklistRun();
    if (actionButton?.dataset.action === 'clear-run') clearChecklistRun();
});

outputFormatted.addEventListener('input', (event) => {
    const note = event.target.closest('.check-note');
    if (!note) return;
    checklistRun.items[checkIndex(note)].note = note.value;
    checklistChanged();
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

// Swaps every mode-specific label, placeholder and card between the modes.
// Elements keep their test-case text in the markup and the other modes' text in
// data-bug-report / data-checklist (and their -placeholder forms), falling back to
// the test-case text when a mode has none; data-only-mode shows one mode only.
function switchMode(mode) {
    currentMode = mode;
    writeStorage(MODE_KEY, mode);

    modeOptions.forEach(option => {
        const active = option.dataset.mode === mode;
        option.classList.toggle('active', active);
        option.setAttribute('aria-selected', String(active));
    });

    document.querySelectorAll('[data-bug-report], [data-checklist]').forEach(element => {
        element.dataset.testCases ??= element.textContent;
        element.textContent = element.dataset[mode] ?? element.dataset.testCases;
    });

    document.querySelectorAll('[data-bug-report-placeholder], [data-checklist-placeholder]').forEach(element => {
        element.dataset.testCasesPlaceholder ??= element.placeholder;
        element.placeholder = element.dataset[`${mode}Placeholder`] ?? element.dataset.testCasesPlaceholder;
    });

    document.querySelectorAll('[data-only-mode]').forEach(element => {
        element.hidden = element.dataset.onlyMode !== mode;
    });

    // The checklist needs more room while the tester works through it
    outputFormatted.classList.toggle('checklist-view', mode === 'checklist');

    // The current output belongs to the other mode; a checklist run comes back
    // so the tester can carry on after filing a bug report
    if (mode === 'checklist' && checklistRun) {
        showChecklistRun();
    } else {
        outputSection.style.display = 'none';
    }
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
    currentWorkflowStep = stepNumber;
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
    updateWorkflowStep(3);
}

// ===================================
// Saved Tokens (ClickUp, Azure DevOps)
// ===================================

// An integration token typed in once and, if the user asks, kept in this browser. While
// one is kept, the field shows a "Token Saved" panel with Change and Remove instead.
function createTokenField(container, storageKey) {
    const input = container.querySelector('.token-input');
    const setupPanel = container.querySelector('.token-setup');
    const savedPanel = container.querySelector('.token-saved-section');
    // Only a token typed into the visible field counts; the hidden one may hold browser autofill
    const typedToken = () => setupPanel.style.display === 'none' ? '' : input.value.trim();

    const showSaved = saved => {
        setupPanel.style.display = saved ? 'none' : 'block';
        savedPanel.style.display = saved ? 'block' : 'none';
    };
    const showInput = () => {
        showSaved(false);
        input.value = '';
        input.focus();
    };
    const remove = () => {
        writeStorage(storageKey, null);
        showInput();
        showNotification('Token removed successfully', 'success');
    };

    container.querySelector('.token-change').addEventListener('click', showInput);
    container.querySelector('.token-remove').addEventListener('click', remove);
    container.querySelector('.toggle-password').addEventListener('click', event => {
        const reveal = input.type === 'password';
        input.type = reveal ? 'text' : 'password';
        event.currentTarget.innerHTML = `<i class="fas ${reveal ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
    });
    showSaved(Boolean(readStorage(storageKey)));

    return {
        // A newly typed token replaces the saved one
        token: () => typedToken() || readStorage(storageKey),
        // Call after a fetch worked, so only a token that works is kept
        keepTypedToken() {
            if (!typedToken() || !container.querySelector('.token-remember').checked) return;
            writeStorage(storageKey, typedToken());
            showSaved(true);
        },
        showInput,
        remove
    };
}

// ===================================
// ClickUp Fetch
// ===================================

async function fetchClickUpTask() {
    const token = clickupTokenField.token();
    const taskId = clickupTaskId.value.trim();

    if (!token) {
        showNotification('Please enter your ClickUp API token', 'error');
        clickupTokenField.showInput();
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

        clickupTokenField.keepTypedToken();

        // Display the fetched story
        currentUserStory = data.userStory;
        clickupStoryPreview.textContent = data.userStory;
        clickupPreview.style.display = 'block';
        userStoryInput.value = data.userStory;
        updateCharCount();

        showNotification('Task fetched successfully!', 'success');
        updateWorkflowStep(3);

    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message || 'Failed to fetch task', 'error');

        if (error.message && error.message.includes('401')) {
            clickupTokenField.remove();
            showNotification('Invalid token. Please enter a valid API token.', 'error');
        }
    } finally {
        fetchClickUpBtn.disabled = false;
        btnText.style.display = 'inline';
        loader.style.display = 'none';
    }
}

// ===================================
// Azure DevOps Import
// ===================================

// "1234", "#1234", or a link to the work item (…/_workitems/edit/1234, or a board's ?workitem=1234)
function parseWorkItemId(input) {
    const match = input.trim().match(/^#?(\d+)$/)
        ?? input.match(/_workitems\/edit\/(\d+)/i)
        ?? input.match(/[?&](?:workitem|id)=(\d+)/i);
    return match?.[1] ?? null;
}

// Tags that start a new line; any other tag (span, b, a…) runs on within the line
const LINE_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'H1', 'H2', 'H3',
    'H4', 'H5', 'H6', 'HR', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TFOOT', 'THEAD', 'UL'
]);
const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE']);

const cleanLines = text => text.split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

// Text of an element with a newline wherever the rich text starts a new line; the
// whitespace inside the HTML (indentation, wrapped source lines) collapses to spaces
function elementText(element) {
    return [...element.childNodes].map(child => {
        if (child.nodeType === Node.TEXT_NODE) return child.textContent.replace(/\s+/g, ' ');
        if (child.nodeType !== Node.ELEMENT_NODE || IGNORED_TAGS.has(child.tagName)) return '';
        if (child.tagName === 'BR') return '\n';
        if (child.tagName === 'LI') return `\n- ${cleanLines(elementText(child))}\n`;
        if (child.tagName === 'TR') return `\n${tableRowText(child)}\n`;
        return LINE_TAGS.has(child.tagName) ? `\n${elementText(child)}\n` : elementText(child);
    }).join('');
}

// A row of one-line cells stays one line ("US-01.1 | As a customer… | AC-01.1"), so the
// story keeps an ID next to its text; cells with several lines each keep their lines
function tableRowText(row) {
    const cells = [...row.cells].map(cell => cleanLines(elementText(cell))).filter(Boolean);
    return cells.join(cells.some(cell => cell.includes('\n')) ? '\n' : ' | ');
}

// Work item fields are rich text. DOMParser builds an inert document (no scripts run, no
// images load), and the checklist numbers the story by line, so lines must survive.
const htmlToText = html => cleanLines(elementText(new DOMParser().parseFromString(html, 'text/html').body));

// Markdown that Azure DevOps didn't render to HTML: keeps its lines and drops the markup
// (bold, table pipes and divider rows, heading underlines)
const markdownToText = markdown => cleanLines(markdown
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\*\*|__/g, '')
    .split('\n')
    .filter(line => !/^[\s|:-]*$/.test(line))
    .map(line => line.trim().replace(/^\|\s*|\s*\|$/g, ''))
    .join('\n'));

const richText = ({ text, format }) => format === 'markdown' ? markdownToText(text) : htmlToText(text);

// Markdown comments mention people as @<id>, which means nothing to a tester or the AI
const withoutIdMentions = text => cleanLines(text.replace(/@<[0-9a-f-]{36}>/gi, ''));

// Each comment under a line naming its author and date, so the AI can tell the latest decision
function commentsSection(comments) {
    const entries = comments
        .map(comment => [comment, withoutIdMentions(richText(comment))])
        .filter(([, text]) => text)
        .map(([comment, text]) => {
            const date = new Date(comment.date).toLocaleDateString(undefined, { dateStyle: 'medium' });
            return `${comment.author} (${date}):\n${text}`;
        });
    return entries.length ? `Comments:\n${entries.join('\n\n')}` : '';
}

function workItemStory(workItem) {
    const sections = workItem.sections
        .map(section => [section.heading, richText(section)])
        .filter(([, text]) => text)
        .map(([heading, text]) => `${heading}:\n${text}`);
    return [workItem.title, ...sections, commentsSection(workItem.comments ?? [])].filter(Boolean).join('\n\n');
}

// "3 comments", or null when they weren't asked for
const commentCount = workItem => workItem.comments && plural(workItem.comments.length, 'comment');

function showFetchedWorkItem(workItem) {
    const story = workItemStory(workItem);
    azureItemInfo.innerHTML = `
        <i class="fab fa-microsoft" style="color: var(--primary-color);"></i>
        <a href="${escapeAttr(workItem.url)}" target="_blank" rel="noopener noreferrer"><strong>#${escapeHtml(String(workItem.id))}</strong></a>
        <span>${escapeHtml(workItem.type)} · ${escapeHtml(workItem.state)}${commentCount(workItem) ? ` · ${escapeHtml(commentCount(workItem))}` : ''}</span>
    `;
    azureStoryPreview.textContent = story;
    azurePreview.style.display = 'block';
    userStoryInput.value = story;
    updateCharCount();
}

async function fetchAzureWorkItem() {
    const organizationUrl = azureOrgUrl.value.trim();
    const token = azureTokenField.token();
    const workItemId = parseWorkItemId(azureWorkItemId.value);

    if (!organizationUrl) {
        showNotification('Please enter your Azure DevOps organization URL', 'error');
        azureOrgUrl.focus();
        return;
    }
    if (!token) {
        showNotification('Please enter your Azure DevOps personal access token', 'error');
        azureTokenField.showInput();
        return;
    }
    if (!workItemId) {
        showNotification('Please enter a work item ID, like 1234, or paste its link', 'error');
        azureWorkItemId.focus();
        return;
    }

    const btnText = fetchAzureBtn.querySelector('.btn-text');
    const loader = fetchAzureBtn.querySelector('.loader');
    fetchAzureBtn.disabled = true;
    btnText.style.display = 'none';
    loader.style.display = 'block';

    try {
        const workItem = await postJson('/api/azure-devops/fetch-work-item',
            { organizationUrl, workItemId, token, includeComments: azureIncludeComments.checked }, 'Failed to fetch the work item');
        azureTokenField.keepTypedToken();
        writeStorage(AZURE_ORG_URL_KEY, organizationUrl);
        showFetchedWorkItem(workItem);
        const withComments = commentCount(workItem) ? ` with ${commentCount(workItem)}` : '';
        showNotification(`Fetched ${workItem.type} #${workItem.id}${withComments}`, 'success');
        updateWorkflowStep(3);
    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message || 'Failed to fetch the work item', 'error');
    } finally {
        fetchAzureBtn.disabled = false;
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
        updateWorkflowStep(3);

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
        subtitle.textContent = 'Test cases and checklists from user stories, bug reports from issue descriptions';
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
    if (model.free) return 'FREE';
    // Negative or missing prices mean the cost varies per request
    if (!(model.inputPrice >= 0) || !(model.outputPrice >= 0)) return 'variable price';
    return `$${model.inputPrice.toFixed(2)} in / $${model.outputPrice.toFixed(2)} out per 1M tokens`;
}

function updateOpenRouterHint() {
    if (!openRouterModels) return;
    const model = openRouterModels.find(m => m.id === openrouterModel.value.trim());
    if (model) {
        const context = model.contextLength ? ` · ${model.contextLength.toLocaleString()} token context` : '';
        const maxOutput = model.maxOutput ? ` · up to ${model.maxOutput.toLocaleString()} output tokens` : '';
        const expiry = model.expiresAt ? ` · available until ${model.expiresAt}` : '';
        openrouterModelHint.textContent = `${model.name} · ${formatModelPrice(model)}${context}${maxOutput}${expiry}`;
    } else {
        const freeCount = openRouterModels.filter(m => m.free).length;
        openrouterModelHint.textContent = `${openRouterModels.length} models available, ${freeCount} of them free and listed first. Type to search; add ":free" to see only free models.`;
    }
}

// ===================================
// Test Case Generation
// ===================================

// Returns the parsed reply, or throws the server's explanation of what went wrong
async function postJson(url, body, failureMessage) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || data.error || failureMessage);
    }
    return data;
}

async function generateOutput() {
    const input = userStoryInput.value.trim();
    const provider = getSelectedProvider();
    const openRouterModelId = openrouterModel.value.trim();
    const mode = currentMode;
    const generator = GENERATORS[mode];

    if (!input) {
        showNotification(generator.missingInput, 'error');
        return;
    }

    if (provider === 'openrouter' && !openRouterModelId) {
        showNotification('Please choose an OpenRouter model', 'error');
        return;
    }

    // Update workflow
    updateWorkflowStep(4);

    // Show loading state
    generateBtn.disabled = true;
    document.querySelector('#generateBtn .btn-text').style.display = 'none';
    document.querySelector('#generateBtn .loader').style.display = 'block';
    outputSection.style.display = 'none';

    try {
        const model = provider === 'openrouter' ? openRouterModelId : undefined;
        const preferences = preferencesInput.value.trim() || null;
        const data = await postJson(
            generator.endpoint,
            { [generator.inputField]: input, preferences, provider, model },
            `Failed to generate ${generator.noun.toLowerCase()}`
        );

        // Store and display results
        lastMode = mode;
        generator.show(data, input);
        displayUsageInfo(data.usage, data.modelName, data.provider);
        outputSection.style.display = 'block';

        // Update workflow
        updateWorkflowStep(5);

        // Scroll to output
        outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        showNotification(`${generator.noun} generated with ${data.modelName}!`, 'success');

    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message || 'Generation failed', 'error');
        updateWorkflowStep(3);
        // Bring back the run being tested; it is still the latest checklist
        if (mode === 'checklist' && checklistRun && currentMode === 'checklist') showChecklistRun();
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

const markdownCell = value => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
const markdownRow = cells => `| ${cells.map(markdownCell).join(' | ')} |`;

// The skill's two-part .md layout: a header, Part 1 (analysis), Part 2 (the template table)
function testSuiteMarkdown(suite) {
    const { analysis } = suite;
    const summary = suiteSummary(suite);
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
        markdownRow(['ID', 'Requirement', 'Source']),
        '|----|-------------|--------|',
        ...analysis.requirements.map(r => markdownRow([r.id, r.requirement, r.source])),
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
        markdownRow(headers),
        `|${headers.map(header => '-'.repeat(header.length + 2)).join('|')}|`,
        ...suite.testCases.flatMap(testCaseRows).map(markdownRow),
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
// Checklist (a manual run traced to the story's lines)
// ===================================

const CHECKLIST_COLUMNS = ['Check ID', 'Section', 'Check', 'Expected Result', 'Story Lines', 'Priority', 'Status', 'Notes'];
const STATUS_LABELS = { pass: 'Pass', fail: 'Fail', '': 'Not Run' };
const PRIORITY_CLASSES = ['high', 'medium', 'low'];

const withCheckIds = items => items.map((item, i) => ({ ...item, id: `CL-${String(i + 1).padStart(3, '0')}` }));
const checkIndex = element => Number(element.closest('.check-item').dataset.index);
const escapeAttr = text => escapeHtml(String(text ?? '')).replace(/"/g, '&quot;');
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
let coveringLines = false;

// Line references arrive as ["L4"], "L4, L5", 4 or "4"; keeps the ones the story has
function normalizeLineRefs(value, knownIds) {
    const ids = toList(value)
        .flatMap(ref => toText(ref).split(/[\s,;]+/))
        .map(ref => ref.match(/^L?(\d+)$/i))
        .filter(Boolean)
        .map(match => `L${Number(match[1])}`)
        .filter(id => knownIds.has(id));
    return [...new Set(ids)];
}

// Returns {storyTitle, items, nonTestable, openQuestions}, or null when the reply has no usable JSON
function parseChecklistReply(text, storyLines) {
    const parsed = parseModelJson(text);
    if (!parsed || typeof parsed !== 'object') return null;
    const reply = Array.isArray(parsed) ? { checks: parsed } : parsed;
    const rawChecks = field(reply, 'checks', 'items', 'checklist');
    if (!Array.isArray(rawChecks)) return null;

    const knownIds = new Set(storyLines.map(line => line.id));
    return {
        storyTitle: toText(field(reply, 'storyTitle', 'title')),
        items: rawChecks.filter(raw => raw && typeof raw === 'object').map(raw => ({
            id: '',
            section: toText(field(raw, 'section', 'area', 'feature')),
            check: toText(field(raw, 'check', 'action', 'title', 'step')),
            expected: toText(field(raw, 'expected', 'expectedResult', 'result')),
            lines: normalizeLineRefs(field(raw, 'lines', 'storyLines', 'lineIds', 'line'), knownIds),
            priority: toText(field(raw, 'priority')),
            status: '',
            note: ''
        })),
        nonTestable: toList(field(reply, 'nonTestableLines', 'nonTestable')).flatMap(entry => {
            const isObject = entry && typeof entry === 'object';
            const [line] = normalizeLineRefs(isObject ? field(entry, 'line', 'id') : entry, knownIds);
            return line ? [{ line, reason: isObject ? toText(field(entry, 'reason')) : '' }] : [];
        }),
        openQuestions: toList(field(reply, 'openQuestions', 'questions')).map(toText)
    };
}

// Each story line with its checks and a result: the combined verdict of its checks,
// or notTestable / missing when no check covers it
function storyLineCoverage(run) {
    return run.storyLines.map(line => {
        const checks = run.items.filter(item => item.lines.includes(line.id));
        const nonTestable = run.nonTestable.find(entry => entry.line === line.id);
        let result = 'notRun';
        if (!checks.length) result = nonTestable ? 'notTestable' : 'missing';
        else if (checks.some(check => check.status === 'fail')) result = 'fail';
        else if (checks.every(check => check.status === 'pass')) result = 'pass';
        return { ...line, checks, nonTestable, result };
    });
}

function checklistSummary(run) {
    const coverage = storyLineCoverage(run);
    const passed = run.items.filter(item => item.status === 'pass').length;
    const failed = run.items.filter(item => item.status === 'fail').length;
    const missing = coverage.filter(line => line.result === 'missing');
    const notTestable = coverage.filter(line => line.result === 'notTestable').length;
    return {
        total: run.items.length,
        passed,
        failed,
        notRun: run.items.length - passed - failed,
        hasResults: run.items.some(item => item.status || item.note),
        coverage,
        missing,
        notTestable,
        covered: coverage.length - missing.length - notTestable
    };
}

function lineResultLabel(line) {
    if (line.result === 'missing') return 'Missing';
    if (line.result === 'notTestable') return `Not testable${line.nonTestable.reason ? `: ${line.nonTestable.reason}` : ''}`;
    if (line.result === 'notRun') {
        const ran = line.checks.filter(check => check.status).length;
        return ran ? `${ran} of ${line.checks.length} run` : 'Not run';
    }
    return STATUS_LABELS[line.result];
}

function renderRunBar(summary) {
    const share = count => summary.total ? (count / summary.total * 100).toFixed(2) : 0;
    return `
        <div class="run-bar" role="img" aria-label="${summary.passed} passed, ${summary.failed} failed, ${summary.notRun} not run">
            <span class="run-bar-pass" style="width: ${share(summary.passed)}%"></span>
            <span class="run-bar-fail" style="width: ${share(summary.failed)}%"></span>
        </div>
    `;
}

const renderRunCounts = summary => `
    <span class="run-count pass"><i class="fas fa-check"></i> ${summary.passed} passed</span>
    <span class="run-count fail"><i class="fas fa-xmark"></i> ${summary.failed} failed</span>
    <span class="run-count">${summary.notRun} not run · ${plural(summary.total, 'check')}</span>
`;

function renderRunProgress(summary) {
    return `
        ${renderRunBar(summary)}
        <div class="run-counts">
            ${renderRunCounts(summary)}
            <div class="run-actions">
                <button class="btn-secondary btn-sm run-reset" data-action="reset-run" ${summary.hasResults ? '' : 'disabled'}>
                    <i class="fas fa-rotate-left"></i> Reset results
                </button>
                <button class="btn-danger btn-sm" data-action="clear-run" title="Delete this checklist so a reload no longer brings it back">
                    <i class="fas fa-trash-can"></i> Clear checklist
                </button>
            </div>
        </div>
    `;
}

// Names the lines the model set aside as not testable, so the tester can check its reasons
function notTestableNote(coverage) {
    const ids = coverage.filter(line => line.result === 'notTestable').map(line => line.id);
    return ids.length
        ? `; ${escapeHtml(ids.join(', '))} ${ids.length === 1 ? 'is' : 'are'} marked not testable (reasons under Story coverage)`
        : '';
}

function renderCoverage(run, summary, open) {
    const { coverage, missing } = summary;
    const notice = missing.length
        ? `<div class="output-notice coverage-alert">
                <span><i class="fas fa-exclamation-triangle"></i> ${plural(missing.length, 'story line')} ${missing.length === 1 ? 'has' : 'have'} no check: ${escapeHtml(missing.map(line => line.id).join(', '))}</span>
                <button class="btn-primary btn-sm" data-action="cover-missing" ${coveringLines ? 'disabled' : ''}>
                    <i class="fas fa-plus"></i> Add checks for missing lines
                </button>
            </div>`
        : `<p class="coverage-ok"><i class="fas fa-circle-check"></i> Every line of the story is covered${notTestableNote(coverage)}.</p>`;
    const rows = coverage.map(line => `
        <tr class="coverage-row ${line.result}">
            <td>${escapeHtml(line.id)}</td>
            <td dir="auto">${escapeHtml(line.text)}</td>
            <td>${escapeHtml(line.checks.map(check => check.id).join(', ') || '-')}</td>
            <td><span class="line-result ${line.result}">${escapeHtml(lineResultLabel(line))}</span></td>
        </tr>
    `).join('');
    const questions = run.openQuestions.length
        ? `<h4>Open questions</h4><ol>${run.openQuestions.map(question => `<li dir="auto">${escapeHtml(question)}</li>`).join('')}</ol>`
        : '';

    return `
        ${notice}
        <details class="analysis" ${open ? 'open' : ''}>
            <summary>
                <span class="analysis-heading">Story coverage${run.storyTitle ? ` · ${escapeHtml(run.storyTitle)}` : ''}</span>
                <span class="analysis-stats">${plural(coverage.length, 'line')} · ${summary.covered} covered · ${summary.notTestable} not testable · ${missing.length} missing</span>
            </summary>
            <table class="analysis-requirements coverage-table">
                <thead><tr><th>Line</th><th>Story text</th><th>Checks</th><th>Result</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            ${questions}
        </details>
    `;
}

const renderNoteInput = item => `
    <textarea class="check-note" rows="2" dir="auto" aria-label="Notes for ${escapeAttr(item.id)}" placeholder="What happened? Note the actual result" ${item.status === 'fail' || item.note ? '' : 'hidden'}>${escapeHtml(item.note)}</textarea>
`;

// The PDF can't show a text box's overflow, so its notes are plain text
const renderNoteText = item => item.note
    ? `<p class="check-note-text" dir="auto"><strong>Note:</strong> ${escapeHtml(item.note)}</p>`
    : '';

function renderCheckItem(item, index, linesById, renderNote) {
    const priority = item.priority.toLowerCase();
    const verdict = (value, icon, label) => `
        <button class="verdict-btn ${value}" data-verdict="${value}" aria-pressed="${item.status === value}">
            <i class="fas ${icon}"></i> ${label}
        </button>`;
    // Hovering a line reference shows the story text the check verifies
    const lineRefs = item.lines
        .map(id => `<span class="line-ref" title="${escapeAttr(linesById.get(id))}">${escapeHtml(id)}</span>`)
        .join('');

    return `
        <li class="check-item" data-index="${index}" data-status="${item.status || 'none'}">
            <div class="check-row">
                <span class="table-id">${escapeHtml(item.id)}</span>
                <div class="check-body">
                    <div class="check-action" dir="auto">${escapeHtml(item.check)}</div>
                    ${item.expected ? `<div class="check-expected" dir="auto"><strong>Expected:</strong> ${escapeHtml(item.expected)}</div>` : ''}
                    <div class="check-meta">
                        ${item.priority ? `<span class="table-priority ${PRIORITY_CLASSES.includes(priority) ? priority : ''}">${escapeHtml(item.priority)}</span>` : ''}
                        ${lineRefs}
                    </div>
                </div>
                <div class="check-verdict" role="group" aria-label="Result of ${escapeAttr(item.id)}">
                    ${verdict('pass', 'fa-check', 'Pass')}
                    ${verdict('fail', 'fa-xmark', 'Fail')}
                </div>
            </div>
            ${renderNote(item)}
        </li>
    `;
}

// Checks grouped by section, in the order each section first appears
function groupBySection(items) {
    const sections = new Map();
    items.forEach((item, index) => {
        const name = item.section || 'Checks';
        sections.set(name, [...(sections.get(name) || []), { item, index }]);
    });
    return [...sections];
}

function renderChecklistItems(run, renderNote) {
    const linesById = new Map(run.storyLines.map(line => [line.id, line.text]));
    return groupBySection(run.items).map(([name, entries]) => `
        <section class="check-section">
            <h4 class="check-section-title" dir="auto">${escapeHtml(name)}</h4>
            <ul class="check-list">${entries.map(({ item, index }) => renderCheckItem(item, index, linesById, renderNote)).join('')}</ul>
        </section>
    `).join('');
}

const checklistRows = run => run.items.map(item => [
    item.id, item.section, item.check, item.expected, item.lines.join(', '), item.priority, STATUS_LABELS[item.status], item.note
]);

function renderChecklistData() {
    renderSheet(CHECKLIST_COLUMNS, checklistRows(checklistRun), 'sheet-checklist');
    outputRaw.textContent = JSON.stringify(checklistRun, null, 2);
}

// Draws the whole run: progress, story coverage and the checks, plus the table and raw views
function renderChecklistRun() {
    const summary = checklistSummary(checklistRun);
    outputFormatted.innerHTML = `
        <div class="run-progress" id="runProgress">${renderRunProgress(summary)}</div>
        <div id="checklistCoverage">${renderCoverage(checklistRun, summary, summary.missing.length > 0)}</div>
        ${renderChecklistItems(checklistRun, renderNoteInput)}
    `;
    renderChecklistData();
}

// After a mark or a note: save, then redraw what counts results. The checks stay in
// place, so a note being typed keeps its focus.
function checklistChanged() {
    saveChecklistRun();
    const summary = checklistSummary(checklistRun);
    document.getElementById('runProgress').innerHTML = renderRunProgress(summary);
    const coverage = document.getElementById('checklistCoverage');
    coverage.innerHTML = renderCoverage(checklistRun, summary, coverage.querySelector('details')?.open);
    renderChecklistData();
}

// Clicking the active verdict again clears it
function setCheckStatus(index, verdict) {
    const item = checklistRun.items[index];
    item.status = item.status === verdict ? '' : verdict;

    const element = outputFormatted.querySelector(`.check-item[data-index="${index}"]`);
    element.dataset.status = item.status || 'none';
    element.querySelectorAll('.verdict-btn').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.verdict === item.status));
    });
    // A failed check asks what happened, ready for the bug report
    const note = element.querySelector('.check-note');
    note.hidden = item.status !== 'fail' && !item.note;
    if (item.status === 'fail' && !item.note) note.focus();

    checklistChanged();
}

function resetChecklistRun() {
    if (!confirm('Clear every Pass/Fail mark and note in this checklist?')) return;
    checklistRun.items.forEach(item => {
        item.status = '';
        item.note = '';
    });
    saveChecklistRun();
    renderChecklistRun();
}

// Deletes the saved run, so a reload no longer brings it back
function clearChecklistRun() {
    if (!confirm('Delete this checklist, with all its Pass/Fail marks and notes? This cannot be undone.')) return;
    checklistRun = null;
    writeStorage(CHECKLIST_RUN_KEY, null);
    outputSection.style.display = 'none';
    updateWorkflowStep(Math.min(currentWorkflowStep, 3));
    showNotification('Checklist cleared', 'success');
}

function displayNewChecklist(data, story) {
    const reply = parseChecklistReply(data.checklist, data.storyLines);
    if (!reply) {
        checklistRun = null;
        writeStorage(CHECKLIST_RUN_KEY, null);
        displayUnparsedReply(data.checklist, data.truncated);
        return;
    }

    checklistRun = {
        storyTitle: reply.storyTitle,
        story,
        storyLines: data.storyLines,
        items: withCheckIds(reply.items),
        nonTestable: reply.nonTestable,
        openQuestions: reply.openQuestions,
        generatedWith: { modelName: data.modelName, provider: data.provider, usage: data.usage }
    };
    saveChecklistRun();
    renderChecklistRun();
}

// Shows the saved run again, after a reload or a detour to another mode
function showChecklistRun() {
    lastMode = 'checklist';
    renderChecklistRun();
    const { modelName, provider, usage } = checklistRun.generatedWith || {};
    if (usage) {
        displayUsageInfo(usage, modelName, provider);
    } else {
        usageInfo.innerHTML = '';
    }
    outputSection.style.display = 'block';
}

function addToChecklistRun(run, checks, notTestable, openQuestions) {
    run.items = withCheckIds([...run.items, ...checks]);
    run.nonTestable.push(...notTestable);
    run.openQuestions = [...new Set([...run.openQuestions, ...openQuestions])];
}

function coverResultMessage(stillMissing, added, setAside) {
    if (stillMissing) {
        return `${plural(stillMissing, 'line')} still ${stillMissing === 1 ? 'has' : 'have'} no check; try again or pick another model`;
    }
    const setAsideNote = setAside.length ? `; ${setAside.map(entry => entry.line).join(', ')} marked not testable` : '';
    return `Added ${plural(added.length, 'check')}${setAsideNote}`;
}

// Asks for checks on just the lines no check covers yet, and adds them to the run
async function coverMissingLines(button) {
    if (coveringLines) return;
    const run = checklistRun;
    const missing = checklistSummary(run).missing.map(line => line.id);
    const provider = getSelectedProvider();
    const model = provider === 'openrouter' ? openrouterModel.value.trim() : undefined;
    if (provider === 'openrouter' && !model) {
        showNotification('Please choose an OpenRouter model', 'error');
        return;
    }

    coveringLines = true;
    const label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="loader"></span> Adding checks…';

    try {
        const data = await postJson(GENERATORS.checklist.endpoint, {
            userStory: run.story,
            focusLines: missing,
            preferences: preferencesInput.value.trim() || null,
            provider,
            model
        }, 'Failed to add checks');
        const reply = parseChecklistReply(data.checklist, run.storyLines);
        if (!reply) {
            throw new Error('The model\'s reply isn\'t valid JSON; try again');
        }
        // A new checklist was generated meanwhile; these checks belong to the old one
        if (run !== checklistRun) return;

        // Only checks for the lines asked about, so covered lines don't get duplicates
        const focus = new Set(missing);
        const added = reply.items.filter(item => item.lines.some(id => focus.has(id)));
        const setAside = reply.nonTestable.filter(entry => focus.has(entry.line));
        addToChecklistRun(run, added, setAside, reply.openQuestions);
        saveChecklistRun();

        const stillMissing = checklistSummary(run).missing.length;
        showNotification(coverResultMessage(stillMissing, added, setAside), stillMissing ? 'error' : 'success');
        if (currentMode === 'checklist') {
            renderChecklistRun();
            displayUsageInfo(data.usage, data.modelName, data.provider);
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message || 'Failed to add checks', 'error');
    } finally {
        coveringLines = false;
        if (button.isConnected) {
            button.disabled = false;
            button.innerHTML = label;
        }
    }
}

// The PDF: the run's result, then the checks as they look on screen. The story coverage
// table stays out; it is for building the checklist, not for reporting the run.
function renderChecklistReport(run) {
    const summary = checklistSummary(run);
    const exportedAt = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return `
        <header class="report-header">
            <h1>Manual Test Checklist</h1>
            ${run.storyTitle ? `<p class="report-story" dir="auto">${escapeHtml(run.storyTitle)}</p>` : ''}
            ${renderRunBar(summary)}
            <div class="run-counts">
                ${renderRunCounts(summary)}
                <span class="report-date">${escapeHtml(exportedAt)}</span>
            </div>
        </header>
        ${renderChecklistItems(run, renderNoteText)}
    `;
}

// Pass/Fail marks as ticked boxes, then the story coverage table
function checklistMarkdown(run) {
    const summary = checklistSummary(run);
    const checkLine = item => {
        const expected = item.expected ? ` → ${item.expected}` : '';
        const note = item.note ? `\n  - Note: ${item.note.replace(/\r?\n/g, ' ')}` : '';
        return `- [${item.status === 'pass' ? 'x' : ' '}] **${item.id}** ${item.check}${expected} · **${STATUS_LABELS[item.status]}** · ${item.lines.join(', ')}${note}`;
    };

    return [
        `# Manual Test Checklist${run.storyTitle ? ` — ${run.storyTitle}` : ''}`,
        '',
        `**Result:** ${summary.passed} passed · ${summary.failed} failed · ${summary.notRun} not run · ${plural(summary.total, 'check')}`,
        '',
        `**Story coverage:** ${plural(summary.coverage.length, 'line')} · ${summary.covered} covered · ${summary.notTestable} not testable · ${summary.missing.length} missing`,
        '',
        '---',
        '',
        ...groupBySection(run.items).flatMap(([name, entries]) => [`## ${name}`, '', ...entries.map(({ item }) => checkLine(item)), '']),
        '---',
        '',
        '## Story coverage',
        '',
        markdownRow(['Line', 'Story text', 'Checks', 'Result']),
        '|------|------------|--------|--------|',
        ...summary.coverage.map(line => markdownRow([
            line.id, line.text, line.checks.map(check => check.id).join(', ') || '-', lineResultLabel(line)
        ])),
        '',
        ...(run.openQuestions.length
            ? ['## Open questions', '', ...run.openQuestions.map((question, i) => `${i + 1}. ${question}`), '']
            : [])
    ].join('\n');
}

// ===================================
// Saved State
// ===================================

// Blocked storage (private windows, site data off) throws a SecurityError and a full
// one a QuotaExceededError, both DOMExceptions. The app still works without storage,
// it just won't remember the mode or the run.
function readStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        if (!(error instanceof DOMException)) throw error;
        return null;
    }
}

function writeStorage(key, value) {
    try {
        if (value === null) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, value);
        }
    } catch (error) {
        if (!(error instanceof DOMException)) throw error;
    }
}

const saveChecklistRun = () => writeStorage(CHECKLIST_RUN_KEY, JSON.stringify(checklistRun));

const isSavedCheck = item => item && Array.isArray(item.lines) && Object.hasOwn(STATUS_LABELS, item.status);

// The saved run, or null when there is none or it is unreadable (edited by hand or an older shape)
function loadSavedChecklistRun() {
    let run;
    try {
        run = JSON.parse(readStorage(CHECKLIST_RUN_KEY));
    } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return null;
    }
    if (!run || !Array.isArray(run.items) || !run.items.every(isSavedCheck) || !Array.isArray(run.storyLines)) return null;
    return { nonTestable: [], openQuestions: [], ...run };
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
    if (lastMode === 'checklist') return checklistRun ? checklistMarkdown(checklistRun) : null;
    return lastTestSuite ? testSuiteMarkdown(lastTestSuite) : null;
}

const exportName = () => GENERATORS[lastMode].fileName;

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
    // A checklist exports with the tester's marks and notes
    const data = { testCases: lastTestSuite, checklist: checklistRun, bugReport: lastBugReport }[lastMode];
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
    } else if (lastMode === 'checklist') {
        if (!checklistRun) return showUnparsedExportError();
        // One row per check with the tester's result, ready for a test report
        rows = [CHECKLIST_COLUMNS, ...checklistRows(checklistRun)];
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

// Prints the report through the browser, whose "Save as PDF" keeps the page's styling,
// selectable text and Arabic; the browser names the file after the page title
function downloadChecklistPdf() {
    if (!checklistRun) return showUnparsedExportError();
    const appTitle = document.title;
    printReport.innerHTML = renderChecklistReport(checklistRun);
    document.title = `Checklist - ${checklistRun.storyTitle || 'Manual Test Run'}`;
    document.body.classList.add('printing-report');
    window.addEventListener('afterprint', () => {
        document.body.classList.remove('printing-report');
        document.title = appTitle;
        printReport.innerHTML = '';
    }, { once: true });
    showNotification('Choose "Save as PDF" as the destination to download it', 'success');
    window.print();
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

// Errors explain what went wrong and what to do, so they stay up long enough to read
const NOTIFICATION_DURATION_MS = { success: 3000, error: 10000 };
let notificationTimer;

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

    // An earlier notification's timer must not hide this one early
    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(() => {
        notification.classList.remove('show');
    }, NOTIFICATION_DURATION_MS[type] ?? NOTIFICATION_DURATION_MS.success);
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
    azureOrgUrl.value = readStorage(AZURE_ORG_URL_KEY) ?? azureOrgUrl.value;
    updateCharCount();
    updateWorkflowStep(1);
    document.getElementById('copyrightYear').textContent = new Date().getFullYear();

    // Reopen in the last mode, with any checklist run still in progress
    checklistRun = loadSavedChecklistRun();
    const savedMode = readStorage(MODE_KEY);
    if (Object.hasOwn(GENERATORS, savedMode ?? '')) switchMode(savedMode);
});
