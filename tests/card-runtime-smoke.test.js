const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cardUtils = require('../card-utils');

class MockElement {
    constructor(id = '') {
        this.id = id;
        this.innerText = '';
        this.innerHTML = '';
        this.value = '';
        this.className = '';
        this.checked = true;
        this.contentEditable = 'false';
        this.dataset = {};
        this.style = { display: 'none' };
        this.parentNode = null;
        this.children = [];
        this.classList = {
            add() {},
            remove() {},
            contains() { return false; }
        };
    }

    addEventListener() {}
    setAttribute() {}
    focus() {}
    select() {}
    blur() {}
    remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
    }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    removeChild(child) {
        this.children = this.children.filter(item => item !== child);
        child.parentNode = null;
    }
}

function createRuntime(initialStorage = {}) {
    const storage = new Map(Object.entries(initialStorage).map(([key, value]) => [key, String(value)]));
    const elements = new Map();
    const copied = [];
    const getElement = id => {
        if (!elements.has(id)) elements.set(id, new MockElement(id));
        return elements.get(id);
    };
    const body = new MockElement('body');
    const documentElement = new MockElement('html');
    const document = {
        body,
        documentElement,
        activeElement: null,
        addEventListener() {},
        createElement: tag => new MockElement(tag),
        execCommand: () => true,
        getElementById: getElement,
        querySelector: () => new MockElement('query'),
        querySelectorAll: () => []
    };
    const localStorage = {
        getItem: key => storage.has(key) ? storage.get(key) : null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key)
    };
    const sessionStorage = {
        getItem: () => null,
        setItem() {},
        removeItem() {}
    };
    const window = {
        CardScannerUtils: cardUtils,
        fastToolkitIsPip: true,
        location: { search: '', pathname: '/card.html' },
        addEventListener() {},
        removeEventListener() {},
        open() {},
        getComputedStyle: () => ({ getPropertyValue: () => '#00e676' })
    };
    window.window = window;
    window.self = window;
    window.top = window;
    window.parent = window;
    window.opener = null;

    const context = vm.createContext({
        AbortController,
        Blob,
        CardScannerUtils: cardUtils,
        Date,
        Event: class Event { constructor(type) { this.type = type; } },
        FileReader: class FileReader {},
        Image: class Image {},
        JSON,
        Math,
        Promise,
        URL,
        URLSearchParams,
        clearTimeout() {},
        console,
        document,
        fetch: async () => { throw new Error('Unexpected fetch'); },
        getComputedStyle: window.getComputedStyle,
        localStorage,
        navigator: { clipboard: { writeText: async text => { copied.push(text); } } },
        requestAnimationFrame: callback => callback(),
        sessionStorage,
        setTimeout: callback => { callback(); return 1; },
        window
    });
    context.globalThis = context;
    const code = fs.readFileSync(path.join(__dirname, '..', 'card.js'), 'utf8');
    vm.runInContext(code, context, { filename: 'card.js' });
    return { context, copied, elements, localStorage };
}

test('full card runtime commits and copies a validated AI result', async () => {
    const runtime = createRuntime();
    const accepted = await runtime.context.parseAIResult(
        '5544 // 250.00 // 14:35 // 05-08 // apple pay // declined'
    );

    assert.equal(accepted, true);
    assert.deepEqual(runtime.copied, ['250 // 5544 // 14:35 // 05-08']);
    const saved = JSON.parse(runtime.localStorage.getItem('cardScannerData'));
    assert.equal(saved.status, 'ready');
    assert.equal(saved.network, 'apple pay');
    assert.equal(saved.transactionStatus, 'declined');
    assert.equal(runtime.elements.get('output').innerText, '250 // 5544 // 14:35 // 05-08');
});

test('full card runtime rejects invalid AI data without saving or copying it', async () => {
    const runtime = createRuntime();
    const accepted = await runtime.context.parseAIResult(
        '0000 // 0.00 // 00:00 // 00-00 // unknown // declined'
    );

    assert.equal(accepted, false);
    assert.deepEqual(runtime.copied, []);
    assert.equal(runtime.localStorage.getItem('cardScannerData'), null);
});

test('removing saved card data resets the visible card state', () => {
    const runtime = createRuntime();
    runtime.localStorage.setItem('cardScannerData', JSON.stringify({
        status: 'ready',
        fullText: '10 // 1234 // 10:00 // 05-08',
        card: '1234',
        amount: '10',
        time: '10:00',
        date: '05-08',
        network: 'visa',
        transactionStatus: 'success'
    }));
    runtime.context.loadSavedCardData();
    assert.equal(runtime.elements.get('chip-card').innerText, '1234');

    runtime.localStorage.removeItem('cardScannerData');
    runtime.context.loadSavedCardData();
    assert.equal(runtime.elements.get('output').innerText, 'البيانات ستظهر هنا');
    assert.equal(runtime.elements.get('chip-card').innerText, '-');
});

test('missing AI credentials replace stale card data with an error state', async () => {
    const runtime = createRuntime({
        simah_ai_pref: 'true',
        cardScannerData: JSON.stringify({
            status: 'ready',
            fullText: '10 // 1234 // 10:00 // 05-08',
            card: '1234',
            amount: '10',
            time: '10:00',
            date: '05-08'
        })
    });

    const accepted = await runtime.context.processImage({ type: 'image/png' });
    const saved = JSON.parse(runtime.localStorage.getItem('cardScannerData'));

    assert.equal(accepted, false);
    assert.equal(saved.status, 'error');
    assert.match(saved.fullText, /مفتاح Gemini مفقود/);
    assert.equal(runtime.elements.get('chip-card').innerText, '-');
});
