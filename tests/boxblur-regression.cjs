// Run with: node tests/boxblur-regression.cjs (requires ffmpeg on PATH).
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const elements = {};
function element(id) {
    return elements[id] ||= {
        value: '', style: { setProperty() {} }, listeners: {},
        addEventListener(event, callback) { (this.listeners[event] ||= []).push(callback); },
        setAttribute() {}, appendChild() {},
        getBoundingClientRect() { return { width: 640, height: 480 }; }
    };
}
for (const [id, value] of Object.entries({ videoWidth: 640, videoHeight: 480,
    videoName: 'input', videoExt: '.mp4', outputName: 'output', outputExt: '.mp4',
    targetBitrate: '', blurRadius: 500, bitrateMode: 'auto' })) element(id).value = String(value);
const context = { document: { getElementById: element, createElement: () => element('resizer') },
    ResizeObserver: class { observe() {} }, navigator: {}, setTimeout };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8'), context);

for (const pixelFormat of ['yuv420p', 'yuv422p', 'yuv444p']) {
    for (const [width, height] of [[2, 2], [4, 4], [28, 28], [56, 56], [58, 32], [100, 78]]) {
        vm.runInContext(`Object.assign(selection, {x: 0, y: 0, w: ${width}/640, h: ${height}/480}); generateCommand()`, context);
        const command = element('output').value;
        const match = command.match(/-filter_complex '([^']+)'/);
        assert(match, 'Generated command should include a filter');
        const run = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i',
            `testsrc2=size=640x480:duration=0.1,format=${pixelFormat}`, '-filter_complex', match[1],
            '-map', '[vout]', '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8' });
        assert.strictEqual(run.status, 0, `${pixelFormat} ${width}x${height}: ${run.stderr}`);
    }
}
console.log('Boxblur regression: all selection sizes and pixel formats passed.');
