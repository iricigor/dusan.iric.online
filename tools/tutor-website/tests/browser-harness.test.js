'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkResponsive } = require('./browser/responsive.js');

test('responsive layout failures restore real animation waits for later scenarios', async () => {
    const failure = new Error('Device emulation failed');
    const settings = [];
    await assert.rejects(checkResponsive({
        evaluate: async expression => { settings.push(expression); },
        client: { send: async () => { throw failure; } }
    }), error => error === failure);
    assert.deepEqual(settings, [
        'window.finishTutorTransitions = true',
        'window.finishTutorTransitions = false'
    ]);
});
