// Minimal Chrome DevTools Protocol client over --remote-debugging-pipe.
// The pipe transport is what Extensions.loadUnpacked requires.
import { spawn } from 'node:child_process';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launch(browserPath, profileDir) {
    const browser = spawn(browserPath, [
        `--user-data-dir=${profileDir}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
        '--no-first-run', '--no-default-browser-check', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    const [, , , toBrowser, fromBrowser] = browser.stdio;

    let id = 0;
    let buffer = '';
    const pending = new Map();
    const errors = [];
    fromBrowser.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let end;
        while ((end = buffer.indexOf('\0')) >= 0) {
            const msg = JSON.parse(buffer.slice(0, end));
            buffer = buffer.slice(end + 1);
            if (msg.method === 'Runtime.exceptionThrown') {
                errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
            }
            if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
                errors.push(`${msg.params.entry.text} ${msg.params.entry.url || ''}`);
            }
            if (msg.id && pending.has(msg.id)) {
                const { resolve, reject } = pending.get(msg.id);
                pending.delete(msg.id);
                msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
            }
        }
    });

    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const messageId = ++id;
        pending.set(messageId, { resolve, reject });
        toBrowser.write(JSON.stringify({ id: messageId, method, params, sessionId }) + '\0');
    });
    const attach = async (targetId) => (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
    const evaluate = async (sessionId, expression) => {
        const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
        return result.value;
    };
    const close = () => send('Browser.close').catch(() => {}).finally(() => browser.kill());
    return { send, attach, evaluate, close, errors };
}
