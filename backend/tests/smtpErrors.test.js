// Erreurs SMTP : permanente (5xx, pas de reprise) ou passagère ; adresse inexistante = rebond.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../utils/smtpErrors');

test('5xx = permanent ; 4xx, réseau, délai = passager ; « port 587 » dans le message ne compte pas', () => {
  assert.equal(E.isPermanentSmtpError({ responseCode: 550, response: '550 5.1.1 User unknown' }), true);
  assert.equal(E.isPermanentSmtpError({ response: '554 5.7.1 Relay access denied' }), true);
  assert.equal(E.isPermanentSmtpError({ responseCode: 451, response: '451 4.7.1 Try again later' }), false);
  assert.equal(E.isPermanentSmtpError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 1.2.3.4:587' }), false);
  assert.equal(E.isPermanentSmtpError({ message: 'Timeout on port 587 after 500 ms' }), false);
  assert.equal(E.isPermanentSmtpError(null), false);
  assert.equal(E.smtpCode({ response: '550-5.1.1 multi-line' }), 550);
});

test('adresse inexistante reconnue sur les formulations courantes, pas sur un refus de relais ou un quota', () => {
  assert.equal(E.isRecipientUnknown('550 5.1.1 <cial@prodibat.fr>: Recipient address rejected: User unknown'), true);
  assert.equal(E.isRecipientUnknown({ response: '550 No such user here' }), true);
  assert.equal(E.isRecipientUnknown('550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found'), true);
  assert.equal(E.isRecipientUnknown('554 5.7.1 Relay access denied'), false);
  assert.equal(E.isRecipientUnknown('452 4.2.2 Mailbox full'), false);
  assert.equal(E.isRecipientUnknown('SMTP 550'), false);
});

test('texte journalisé : réponse du serveur en priorité, sinon message', () => {
  assert.equal(E.smtpErrorText({ response: '550 5.1.1 User unknown', message: 'Message failed' }), '550 5.1.1 User unknown');
  assert.equal(E.smtpErrorText({ message: 'connect ECONNREFUSED' }), 'connect ECONNREFUSED');
});
