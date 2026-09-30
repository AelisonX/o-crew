const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const script = fs.readFileSync(__dirname + '/../index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function setup(character, storage = new Map()) {
  const nodes = new Map();
  function element(id) {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { value: '', hidden: true, textContent: '', attrs: {}, handlers: {},
        classList: { add: (...a) => a.forEach(x => classes.add(x)), remove: (...a) => a.forEach(x => classes.delete(x)), toggle(x, force) { const on = force ?? !classes.has(x); on ? classes.add(x) : classes.delete(x); return on; }, contains: x => classes.has(x) },
        setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, v) { this.handlers[k] = v; },
        focus() {}, setPointerCapture() {}, hasPointerCapture() { return false; }
      });
    }
    return nodes.get(id);
  }
  const doc = element('document');
  Object.assign(doc, { hidden: false, getElementById: element, querySelector: element });
  let toggle, requests = 0, resolveReply, rejectReply, sentPrompt;
  const win = element('window');
  Object.assign(win, { location: { search: '?character=' + character }, pet: { roamStop() {}, roamStart() {}, start() {}, end() {}, cancel() {}, onToggle(fn) { toggle = fn; }, onRoamDirection() {} }, ai: { askLocal(prompt) { sentPrompt = prompt; requests++; return new Promise((resolve, reject) => { resolveReply = resolve; rejectReply = reject; }); } } });
  const context = vm.createContext({ document: doc, window: win, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, URLSearchParams, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, console });
  vm.runInContext(script, context);
  return { element, doc, win, toggle, context, sent: () => sentPrompt, requests: () => requests, resolve: x => resolveReply(x), reject: () => rejectReply(Error('offline')) };
}
(async () => {
  const t = setup('doggo'), el = t.element;
  t.toggle(); assert.equal(el('localAiPanel').hidden, false);
  el('localAiPrompt').value = '   '; await el('localAiForm').handlers.submit({ preventDefault() {} }); assert.equal(t.requests(), 0);
  el('localAiPrompt').value = 'hello';
  const pending = el('localAiForm').handlers.submit({ preventDefault() {} });
  assert.equal(el('localAiResponse').textContent, 'Thinking…');
  await el('localAiForm').handlers.submit({ preventDefault() {} }); assert.equal(t.requests(), 1);
  t.doc.handlers.keydown({ key: 'Escape', preventDefault() {} });
  t.resolve('<b>local reply</b>'); await pending;
  assert.equal(el('localAiPanel').hidden, true); assert.equal(el('localAiResponse').textContent, '<b>local reply</b>');
  t.toggle(); assert.equal(el('localAiPanel').hidden, false);
  vm.runInContext('resumeDoggoStateMachine()', t.context); assert.equal(vm.runInContext('doggoState', t.context), 'NOTICE');
  const failed = el('localAiForm').handlers.submit({ preventDefault() {} }); t.reject(); await failed;
  assert.match(el('localAiResponse').textContent, /Check Ollama/); assert.equal(el('localAiSend').disabled, false);
  t.win.ai = undefined; await el('localAiForm').handlers.submit({ preventDefault() {} }); assert.match(el('localAiResponse').textContent, /unavailable/);
  el('localAiClose').handlers.click(); assert.equal(vm.runInContext('doggoState', t.context), 'IDLE');
  const shared = new Map();
  for (const name of ['doggo', 'piggo', 'farto', 'kitto', 'beeo']) {
    const other = setup(name, shared), get = other.element;
    other.toggle(); assert.equal(get('localAiPanel').hidden, false);
    get('localAiTryJob').handlers.click();
    assert.ok(get('localAiPrompt').value.length > 20);
    assert.equal(other.requests(), 0, 'Example waits for Send');
    get('localAiNotes').value = name + '-private-note';
    get('localAiSaveMemory').handlers.click();
    const reply = get('localAiForm').handlers.submit({ preventDefault() {} });
    assert.match(other.sent(), new RegExp(name + '-private-note'));
    for (const rival of ['doggo','piggo','farto','kitto','beeo'].filter(x => x !== name)) assert.ok(!other.sent().includes(rival+'-private-note'));
    other.resolve(name + ' result'); await reply;
    const title = name[0].toUpperCase()+name.slice(1);
    vm.runInContext('resume'+title+'StateMachine()', other.context);
    // A drag still uses the existing pet gesture bridge and leaves chat open.
    get('doggo').handlers.pointerdown({button:0,pointerId:1,preventDefault(){}});
    get('doggo').handlers.pointerup({pointerId:1});
    assert.equal(get('localAiPanel').hidden, false);
    assert.equal(vm.runInContext('activePointer',other.context), null);
    other.doc.hidden = true; other.doc.handlers.visibilitychange();
    other.doc.hidden = false; other.doc.handlers.visibilitychange();
    assert.equal(get('localAiPanel').hidden, false);
    other.toggle(); assert.equal(get('localAiPanel').hidden, true);
    const restored = setup(name, shared);
    assert.equal(restored.element('localAiResponse').textContent, name+' result');
  }
  assert.equal(shared.size, 5);
  const pig = setup('piggo', shared); pig.element('localAiForget').handlers.click();
  assert.equal(shared.size, 4); assert.ok(shared.has('ocrew.doggo.memory.v1'));
  const fallback = setup('unknown'); fallback.toggle(); assert.equal(fallback.element('localAiPanel').hidden, false);
  const storage = new Map();
  const first = setup('doggo', storage);
  first.toggle();
  first.element('localAiNotes').value = 'My name is DemoUser. Use Traditional Chinese.';
  first.element('localAiSaveMemory').handlers.click();
  first.element('localAiPrompt').value = 'I like dogs.';
  const firstReply = first.element('localAiForm').handlers.submit({ preventDefault() {} });
  first.resolve('Dogs are wonderful.'); await firstReply;
  const restarted = setup('doggo', storage);
  restarted.toggle();
  restarted.element('localAiPrompt').value = 'What do I like?';
  const next = restarted.element('localAiForm').handlers.submit({ preventDefault() {} });
  assert.match(restarted.sent(), /DemoUser/);
  assert.match(restarted.sent(), /I like dogs/);
  restarted.reject(); await next;
  assert.equal(JSON.parse(storage.values().next().value).history.length, 1);
  restarted.element('localAiNewChat').handlers.click();
  assert.equal(JSON.parse(storage.values().next().value).history.length, 0);
  assert.match(JSON.parse(storage.values().next().value).notes, /DemoUser/);
  restarted.element('localAiForget').handlers.click();
  assert.equal(storage.size, 0);
  const empty = setup('doggo', storage);
  assert.equal(vm.runInContext('chatHistory.length', empty.context), 0);
  assert.equal(vm.runInContext('savedNotes', empty.context), '');
  console.log('PASS: restart persistence, prior context sent, saved notes, failed calls excluded, New chat preserves notes, Forget all survives restart.');
  console.log('PASS: five roles, editable job examples, isolated memory, drag lifecycle, visibility, fallback, duplicate submissions, late replies and error recovery.');
})();

