const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .filter((script) => script.includes("contact_lead"));

assert.equal(inlineScripts.length, 1, 'Expected exactly one contact tracking script');

let clickHandler;
const calls = [];
const gtag = (...args) => calls.push(args);

const context = {
  gtag,
  window: { gtag },
  document: {
    addEventListener(type, handler) {
      if (type === 'click') clickHandler = handler;
    },
    querySelectorAll() {
      return [];
    }
  },
  setTimeout(handler) {
    handler();
  }
};

vm.runInNewContext(inlineScripts[0], context);
assert.equal(typeof clickHandler, 'function', 'Click handler was not registered');

function simulateClick({ href, button = false, text, sectionId }) {
  calls.length = 0;
  const link = {
    getAttribute(name) {
      return name === 'href' ? href : null;
    },
    classList: {
      contains(name) {
        return name === 'btn' && button;
      }
    },
    closest(selector) {
      return selector === 'section' && sectionId ? { id: sectionId } : null;
    },
    textContent: text
  };

  clickHandler({ target: { closest: () => link } });
  return calls.map(([command, eventName, params]) => ({ command, eventName, params }));
}

const reservation = simulateClick({
  href: 'mailto:udruhemisky@gmail.com',
  button: true,
  text: 'Ověřit volný termín'
});
assert.deepEqual(reservation.map((call) => call.eventName), [
  'reservation_cta_click',
  'contact_lead'
]);
assert.equal(reservation[1].params.contact_method, 'reservation');

const email = simulateClick({
  href: 'mailto:udruhemisky@gmail.com',
  text: 'udruhemisky@gmail.com',
  sectionId: 'kontakt'
});
assert.deepEqual(email.map((call) => call.eventName), ['email_click', 'contact_lead']);
assert.equal(email[1].params.contact_method, 'email');

const phone = simulateClick({
  href: 'tel:+420735826304',
  button: true,
  text: 'Zavolat'
});
assert.deepEqual(phone.map((call) => call.eventName), ['phone_click', 'contact_lead']);
assert.equal(phone[1].params.contact_method, 'phone');

const irrelevant = simulateClick({ href: '#sluzby', text: 'Služby' });
assert.deepEqual(irrelevant, []);

console.log('Tracking tests passed: each contact click emits one diagnostic event and one contact_lead.');
