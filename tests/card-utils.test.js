const test = require('node:test');
const assert = require('node:assert/strict');
const utils = require('../card-utils');

const NOW = new Date('2026-08-05T12:00:00Z');

test('normalizes Western, Arabic, and grouped amounts', () => {
    assert.equal(utils.normalizeAmount('SAR 125.00'), '125');
    assert.equal(utils.normalizeAmount('1,234.50'), '1234.50');
    assert.equal(utils.normalizeAmount('1.234'), '1234');
    assert.equal(utils.normalizeAmount('1.234.567'), '1234567');
    assert.equal(utils.normalizeAmount('١٬٢٣٤٫٥٠ ريال'), '1234.50');
    assert.equal(utils.normalizeAmount('invalid'), null);
});

test('normalizes 24-hour and 12-hour times', () => {
    assert.equal(utils.normalizeTime('9:05 PM'), '21:05');
    assert.equal(utils.normalizeTime('٩:٠٥ م'), '21:05');
    assert.equal(utils.normalizeTime('24:10'), null);
});

test('normalizes current, previous, and ISO dates dynamically', () => {
    assert.equal(utils.normalizeDate('26-08-05', NOW), '05-08');
    assert.equal(utils.normalizeDate('25-08-05', NOW), '05-08-2025');
    assert.equal(utils.normalizeDate('2026/08/05', NOW), '05-08');
    assert.equal(utils.normalizeDate('08-24', NOW), '24-08');
    assert.equal(utils.normalizeDate('31-02-2026', NOW), null);
});

test('accepts and normalizes a valid AI response', () => {
    const parsed = utils.parseAIResultText(
        '```text\n4321 // 1,234.50 // 9:05 PM // 26-08-05 // mada // success\n```',
        NOW
    );

    assert.equal(parsed.valid, true);
    assert.deepEqual(parsed.result, {
        card: '4321',
        amount: '1234.50',
        time: '21:05',
        date: '05-08',
        network: 'mada',
        status: 'success',
        cleanText: '4321 // 1,234.50 // 9:05 PM // 26-08-05 // mada // success',
        fullText: '1234.50 // 4321 // 21:05 // 05-08'
    });
});

test('rejects empty, placeholder, and malformed AI output', () => {
    assert.equal(utils.parseAIResultText('INVALID', NOW).valid, false);
    assert.equal(utils.parseAIResultText('0000 // 0.00 // 00:00 // 00-00 // unknown // declined', NOW).valid, false);
    assert.equal(utils.parseAIResultText('4321 // 0.00 // 10:15 // 05-08 // visa // success', NOW).valid, false);
    assert.equal(utils.parseAIResultText('4321 // 100 // bad // 05-08 // visa // success', NOW).valid, false);
});

test('skips an AI header and accepts the following valid data line', () => {
    const parsed = utils.parseAIResultText(
        'CARD // AMOUNT // TIME // DATE // NETWORK // STATUS\n7788 // 40.00 // 13:20 // 05-08 // visa // success',
        NOW
    );
    assert.equal(parsed.valid, true);
    assert.equal(parsed.result.fullText, '40 // 7788 // 13:20 // 05-08');
});

test('extracts an Arabic Tabby transaction with Arabic digits', () => {
    const parsed = utils.parseLocalOcrText(
        'شراء Tabby بمبلغ ١٬٢٣٤٫٥٠ ريال عبر بطاقة 9876 في ٩:٠٥ م بتاريخ 26-08-05 مدى',
        NOW
    );

    assert.equal(parsed.valid, true);
    assert.equal(parsed.result.fullText, '1234.50 // 9876 // 21:05 // 05-08');
    assert.equal(parsed.result.network, 'mada');
});

test('extracts the card after its marker instead of an earlier year', () => {
    const parsed = utils.parseLocalOcrText(
        'On 2026-08-05 Tabby purchase amount SAR 75.00 using card ending in 4455 at 7:04 AM Visa',
        NOW
    );

    assert.equal(parsed.valid, true);
    assert.equal(parsed.result.card, '4455');
    assert.equal(parsed.result.time, '07:04');
    assert.equal(parsed.result.date, '05-08');
});

test('does not mistake a four-digit amount after Mada for the card', () => {
    const parsed = utils.parseLocalOcrText(
        'Tabby Mada purchase SAR 1000.00 using card 4321 at 12:10 on 2026-08-05',
        NOW
    );
    assert.equal(parsed.valid, true);
    assert.equal(parsed.result.card, '4321');
    assert.equal(parsed.result.amount, '1000');
});

test('selects the Tabby block when multiple transactions exist', () => {
    const parsed = utils.parseLocalOcrText(
        'Purchase SAR 10.00 using card 1111 at 10:00 on 2026-08-04\n\nTabby purchase SAR 50.00 using card 2222 at 11:00 on 2026-08-05',
        NOW
    );

    assert.equal(parsed.valid, true);
    assert.equal(parsed.result.fullText, '50 // 2222 // 11:00 // 05-08');
});

test('detects declined Apple Pay with Apple Pay priority', () => {
    assert.deepEqual(
        utils.detectMeta('عملية Apple Pay Visa مرفوضة بسبب الرصيد غير كافي'),
        { network: 'apple pay', status: 'declined' }
    );
});

test('rejects OCR text without complete transaction fields', () => {
    assert.equal(utils.parseLocalOcrText('', NOW).valid, false);
    assert.equal(utils.parseLocalOcrText('Tabby card 1234 amount 50', NOW).valid, false);
});

test('does not use an account number as a fallback card number', () => {
    const parsed = utils.parseLocalOcrText(
        'Tabby purchase SAR 20.00 from account 7788 at 10:15 on 2026-08-05',
        NOW
    );
    assert.equal(parsed.valid, true);
    assert.equal(parsed.result.card, '0000');
});

test('does not use a four-digit amount as a fallback card number', () => {
    const parsed = utils.parseLocalOcrText(
        'Tabby purchase amount SAR 1000.00 at 10:15 on 2026-08-05',
        NOW
    );
    assert.equal(parsed.valid, true);
    assert.equal(parsed.result.amount, '1000');
    assert.equal(parsed.result.card, '0000');
});

test('rejects zero-value OCR transactions', () => {
    const parsed = utils.parseLocalOcrText(
        'Tabby purchase SAR 0.00 using card 1234 at 10:15 on 2026-08-05',
        NOW
    );
    assert.equal(parsed.valid, false);
});
