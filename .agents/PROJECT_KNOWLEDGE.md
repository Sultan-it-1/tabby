# 📘 FAST TOOLKIT (Tabby) - Master Technical & Architectural Knowledge Base (A-Z)

> **Version**: 2.1.7 (Single Source of Truth defined in `version.js`)  
> **Environment**: Web App / Single-Page Widgets / Chrome Extension (V3 Manifest)  
> **UI Stack**: HTML5, ES6+ Vanilla JavaScript, Vanilla CSS (Custom HSL System & Tokens)  
> **State Storage**: `localStorage`, `sessionStorage`, `chrome.storage.local`  
> **Cloud API Integration**: Google Drive API v3 (OAuth2 GIS Token Client)  
> **AI Services**: Groq API (`llama-3.3-70b-versatile`) & Google Gemini API (`gemini-2.5-flash` / `gemini-1.5-flash`)  

---

## 1. 🏗️ High-Level System Architecture & Directory Tree

```
tabby-main/
├── index.html                   # Launcher Dashboard (Central navigation widget)
├── cia.html & cia.js            # CIA Maker (Problem, Investigation & Action framework)
├── note.html & note.js          # Quick Notes & Copy Grid V6 System
├── simah.html & simah.js        # SIMAH Credit Report AI Parser (Groq & Gemini)
├── card.html, card.js, card-utils.js # Credit Card Scanner, LHN validator & Parser
├── sticky.html & sticky.js      # Multi-Tab Sticky Notes Board (Up to 10 tabs)
├── settings.html & settings.js  # Theme Engine, Custom Color HSL Picker, Drive Cloud Sync
├── theme-utils.js & theme.css   # Dynamic HSL Color Variables & Glassmorphism System
├── version.js                   # Central Version Constant (APP_VERSION = "2.1.7")
├── sw.js & manifest.json        # Service Worker & Web App PWA Manifest
├── chrome-extension/            # Production Extension (Popup, Content Script, Timer Widget)
│   ├── manifest.json
│   ├── launcher.js
│   ├── content.js
│   └── background.js
├── chrome-extension-dev/        # Unpacked Dev Chrome Extension
└── .agents/
    ├── AGENTS.md                # AI Agent Rules (Strict Git Push Restriction)
    └── PROJECT_KNOWLEDGE.md     # Technical Deep-Dive Documentation
```

---

## 2. 🧩 Module-by-Module Technical Deep-Dive

### 2.1 🚀 Main Dashboard (`index.html`)
- **Dimensions**: `230px x 300px` fixed widget layout (optimized for Chrome Popup & Web desktop view).
- **Navigation Grid**: Links to all 6 sub-tools (`note.html`, `cia.html`, `simah.html`, `card.html`, `sticky.html`, `settings.html`).
- **PWA Capabilities**: Registers Service Worker (`sw.js`) and loads `version.js` dynamically.

### 2.2 📋 CIA Maker (`cia.html`, `cia.js`)
- **Concept**: C+I+A Customer Service Response Architecture:
  - `C`: Customer Problem (المشكلة)
  - `I`: Investigation (الفحص/التحقق)
  - `A`: Action (الإجراء/الحل)
- **State Key**: `fastToolkitCIA_v4`
- **Functions**:
  - `loadCIAData()` / `saveCIAData()`: Reads/writes `fastToolkitCIA_v4` from/to `localStorage`.
  - `renderFilterBar()`: Generates dynamic category chips based on distinct `C` values.
  - `renderCardsView()`: Renders interactive CIA cards.
  - `createCiaRow(label, badgeClass, value, isStrong)`: Attaches `onclick` to badges so clicking a badge (`C`, `I`, or `A`) copies that individual field value, while clicking card body copies full formatted report (`C: ...\n\nI: ...\n\nA: ...\n\n#CIA`).
  - `processCiaImportWithConflicts(imported)`: Conflict handling modal when importing duplicate titles (`replace`, `keep_both`, `skip`).
  - `triggerCloudAction(action)`, `executeDriveAction()`, `updateDriveFile()`, `restoreDriveFile()`: Fully handles Google Drive backup & restore to `fast_toolkit_cia_backup.json`.

### 2.3 📝 Quick Notes & Copy Grid V6 (`note.html`, `note.js`)
- **State Keys**: `copyGridDataV6`, `unbackedUpCountV6`, `quick_sticky_note`
- **Features**:
  - Interactive grid cells for instant click-to-copy customer response text.
  - Counters for unbacked-up items.
  - Cloud Backup to Google Drive (`fast_copy_backup.json`).

### 2.4 🧠 SIMAH AI Account Extractor (`simah.html`, `simah.js`)
- **AI Integrations**:
  - **Groq API**: `llama-3.3-70b-versatile` model endpoint.
  - **Gemini API**: Google Generative AI REST endpoint.
- **State Keys**: `simahApprovedAccounts`, `simahAccountsHistory`, `simah_ai_provider`, `simah_ai_key`, `simah_groq_key`, `simah_usage`.
- **Parsing Engine**: Extracts active, approved, and defaulted credit accounts from raw SIMAH text reports, formatting output into clean tables with instant copy buttons.

### 2.5 📇 Card Scanner & Parser (`card.html`, `card.js`, `card-utils.js`)
- **Architecture**: Separated into UI controller (`card.js`) and universal UMD utility module (`card-utils.js`).
- **State Keys**: `cardScannerData`, `cardScannerHistory`, `tabbyInput_saved`, `card_popup_enabled`.
- **Normalization Utilities in `card-utils.js`**:
  - `normalizeDigits(value)`: Converts Arabic-Indic numerals (`٠-٩`, `۰-۹`) to standard ASCII digits (`0-9`) and strips control characters (`\u200e`, `\u200f`).
  - `normalizeAmount(value)`: Parses currency amounts, handling comma/dot decimal separators.
  - `normalizeCard(value)`: Extracts last 4 digits of card number.
  - `normalizeTime(value)`: Converts 12-hour/24-hour time to `HH:MM` standard format.
  - `normalizeDate(value)`: Validates and formats dates (`DD-MM` or `DD-MM-YYYY`).
  - `normalizeNetwork(value)`: Detects card brand (`mada`, `visa`, `mastercard`, `apple pay`).
  - `normalizeStatus(value)`: Categorizes transaction status (`success`, `declined`).

### 2.6 📌 Multi-Tab Sticky Notes (`sticky.html`, `sticky.js`)
- **State Key**: `stickyNotesData` (Array of up to 10 note objects: `{ id, label, text }`).
- **Features**:
  - Tabbed interface allowing switching between 10 independent scratchpads.
  - Automatic title preview (first 8 characters of note text).
  - Motivational footer phrases generator.

### 2.7 ⚙️ Settings & Dynamic HSL Theme Engine (`settings.html`, `settings.js`, `theme-utils.js`, `theme.css`)
- **State Keys**: `fastToolkitSettings`, `fastToolkitShortcuts`, `fastToolkitExpanded`, `gDriveAccessToken`.
- **Theme System**:
  - Custom color picker + 5 curated HSL presets (`#34D399`, `#F43F5E`, `#22D3EE`, `#FB923C`, `#4F46E5`).
  - Light/Dark mode toggle (`modeToggle`).
  - Applied globally via `FastToolkitThemes` API in `theme-utils.js`.
- **Unified Cloud Sync**:
  - `BACKUP_KEYS`: Array of all 17 critical `localStorage` keys.
  - Backup file: `fast_toolkit_unified_backup_cloud.json` on Google Drive.
  - Toast overlay notifications (`showToast`).

### 2.8 🔌 Chrome Extension (`chrome-extension/`, `chrome-extension-dev/`)
- **Manifest**: Version 3 Extension Manifest.
- **Content Script (`content.js`)**:
  - Detects active Tabby ticket URLs (`fastToolkit_activeTicketUrl`).
  - Injectable Ticket Timer Widget with start/stop/reset tracking in `localStorage`.
- **Launcher (`launcher.js`)**: Configures Picture-in-Picture (PiP) window popup bounds.

---

## 3. 📊 Master LocalStorage Keys Registry & Data Schema

| Storage Key | Data Type | Default Value | Description | Cloud Sync |
|---|---|---|---|:---:|
| `fastToolkitSettings` | Object (JSON string) | `{ themePreset: 'custom', mode: 'dark', themeColor: '#34D399' }` | Global theme & UI preferences | ✅ |
| `fastToolkitShortcuts` | Object (JSON string) | `{ nav1: '1', nav2: '2', ... }` | Keyboard shortcut bindings | ✅ |
| `fastToolkitExpanded` | String (`true`/`false`) | `false` | Extended sidebar mode | ✅ |
| `copyGridDataV6` | Array (JSON string) | `[...]` | Quick copy text grid items | ✅ |
| `unbackedUpCountV6` | String (integer) | `"0"` | Counter for unsynced notes | ✅ |
| `quick_sticky_note` | String | `""` | Legacy scratchpad note text | ✅ |
| `stickyNotesData` | Array (JSON string) | `[{ id: 1, label: 'ملاحظة 1', text: '' }]` | Multi-tab sticky notes data | ✅ |
| `currentStickyNoteId` | Number/String | `1` | Active sticky tab ID | ✅ |
| `cardScannerData` | Object (JSON string) | `{ fullText: '', card: '', amount: '', ... }` | Current card scan payload | ✅ |
| `cardScannerHistory` | Array (JSON string) | `[]` | Scan history log | ✅ |
| `simahApprovedAccounts` | Array (JSON string) | `[]` | SIMAH parsed accounts | ✅ |
| `simahAccountsHistory` | Array (JSON string) | `[]` | SIMAH extraction log | ✅ |
| `simah_ai_provider` | String (`groq`/`gemini`) | `"gemini"` | AI service provider | ✅ |
| `simah_ai_key` | String | `""` | Google Gemini API Key | ✅ |
| `simah_groq_key` | String | `""` | Groq API Key | ✅ |
| `simah_usage` | Object (JSON string) | `{ count: 0, date: '' }` | Daily AI token usage | ✅ |
| `fastToolkitCIA_v4` | Array (JSON string) | `[]` | CIA cards array | ✅ |
| `card_popup_enabled` | String (`true`/`false`)| `"true"` | Auto PiP popup setting | ✅ |
| `autoSyncGDrive` | String (`true`/`false`) | `"false"` | Auto Drive sync toggle | ✅ |

---

## 4. 🌐 Cloud API & OAuth Sync Flow

1. **Client ID Source**: `window.GOOGLE_CLIENT_ID` defined in `settings.js`.
2. **OAuth Authorization**: Google Identity Services (`google.accounts.oauth2.initTokenClient`) requests `https://www.googleapis.com/auth/drive.file` scope.
3. **Session Access Token**: `gDriveAccessToken` stored in `sessionStorage`.
4. **Cloud REST Endpoints**:
   - `GET https://www.googleapis.com/drive/v3/files?q=name='...'`: Search backup file ID.
   - `POST https://www.googleapis.com/drive/v3/files`: Create backup JSON file.
   - `PATCH https://www.googleapis.com/upload/drive/v3/files/{fileId}?uploadType=media`: Update file payload.
   - `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media`: Download and restore payload.

---

## 🔒 5. Development Governance Rules

- **Git Push Policy**: NEVER execute `git push` or propose/suggest pushing code to GitHub unless the user explicitly requests it in their message (Enforced in `.agents/AGENTS.md`).
- **Versioning Policy**: `APP_VERSION` in `version.js` is the single source of truth for cache busting across `sw.js` and all page scripts (`script src="...js?v=APP_VERSION"`).
- **Framework Constraint**: No heavy NPM build steps or frontend frameworks (React, Vue, Tailwind). Pure native Web APIs only.
