'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const browserPath = process.env.TUTOR_BROWSER_PATH || [
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
].find(file => fs.existsSync(file));

async function connect(url, events) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (!message.id) return events(message);
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        clearTimeout(request.timeout);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
    });
    return {
        close: () => socket.close(),
        send: (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++sequence;
            const timeout = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`CDP timeout: ${method}${params.expression ? `: ${params.expression.slice(0, 180)}` : ''}`));
            }, 10000);
            pending.set(id, { resolve, reject, timeout });
            socket.send(JSON.stringify({ id, method, params }));
        })
    };
}

async function openBrowser(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-browser-'));
    const profile = path.join(directory, 'profile');
    const processHandle = spawn(browserPath, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0',
        `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let launchError;
    processHandle.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    processHandle.on('error', error => { launchError = error; });
    let client;
    t.after(async () => {
        if (client) {
            await client.send('Browser.close');
            client.close();
        } else if (processHandle.pid) {
            processHandle.kill();
        }
        for (let attempt = 0; attempt < 50 && processHandle.exitCode === null; attempt++) await delay(100);
        if (processHandle.exitCode === null) processHandle.kill();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    });
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let attempt = 0; attempt < 150 && !fs.existsSync(portFile); attempt++) {
        if (launchError) throw launchError;
        if (processHandle.exitCode !== null) throw new Error(`Browser exited: ${stderr}`);
        await delay(100);
    }
    assert.ok(fs.existsSync(portFile), `Browser did not become ready: ${stderr}`);
    const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const exceptions = [];
    const network = [];
    let onDialog;
    client = await connect(target.webSocketDebuggerUrl, event => {
        if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails);
        if (event.method === 'Network.requestWillBeSent' && /^https?:/.test(event.params.request.url)) network.push(event.params.request.url);
        if (event.method === 'Page.javascriptDialogOpening') onDialog?.(event.params);
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        const startTransition = document.startViewTransition?.bind(document);
        window.tabTransitions = [];
        if (startTransition) document.startViewTransition = update => {
            const transition = startTransition(update);
            window.tabTransitions.push(transition);
            return transition;
        };
        window.waitForTutorTab = async () => {
            const transition = window.tabTransitions.at(-1);
            if (transition) await transition.finished;
        };
        window.switchTutorTab = async name => {
            document.querySelector('[data-tab="' + name + '"]').click();
            await window.waitForTutorTab();
        };
    ` });
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const downloads = path.join(directory, 'downloads');
    fs.mkdirSync(downloads);
    await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const evaluate = async (expression, userGesture = false) => {
        const response = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture });
        assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
        return response.result.value;
    };
    const handleDialog = async (action, accept, type) => {
        let timeout;
        const opened = new Promise((resolve, reject) => {
            onDialog = resolve;
            timeout = setTimeout(() => reject(new Error(`Expected ${type} dialog`)), 10000);
        });
        const pendingAction = action();
        // Attach immediately so a failed action does not become an unhandled rejection.
        const completed = pendingAction.then(value => ({ value }), error => ({ error }));
        try {
            const dialog = await opened;
            await client.send('Page.handleJavaScriptDialog', { accept });
            assert.equal(dialog.type, type);
            const result = await completed;
            if (result.error) throw result.error;
            return dialog;
        } finally {
            clearTimeout(timeout);
            onDialog = undefined;
        }
    };
    const capture = async name => {
        if (!process.env.TUTOR_SCREENSHOT_DIRECTORY) return;
        fs.mkdirSync(process.env.TUTOR_SCREENSHOT_DIRECTORY, { recursive: true });
        // Headless rendering can throttle animations inside offscreen disclosures.
        await evaluate('document.getAnimations().forEach(animation => animation.finish())');
        await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(process.env.TUTOR_SCREENSHOT_DIRECTORY, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
    };
    return { directory, client, downloads, evaluate, handleDialog, capture, exceptions, network };
}

module.exports = { browserPath, connect, openBrowser };
