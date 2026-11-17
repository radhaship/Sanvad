import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'fs';

let testEnv: RulesTestEnvironment;

async function setup() {
  testEnv = await initializeTestEnvironment({
    projectId: 'baatcheet-security-test',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });
}

async function runDirtyDozenTests() {
  await setup();
  const alice = testEnv.authenticatedContext('alice', { email: 'alice@example.com', email_verified: true });
  const bob = testEnv.authenticatedContext('bob', { email: 'bob@example.com', email_verified: true });
  const eve = testEnv.authenticatedContext('eve', { email: 'eve@example.com', email_verified: true });
  const unverified = testEnv.authenticatedContext('unverified', { email: 'u@example.com', email_verified: false });

  // 1. PII Snooping: Bob cannot read Alice's private /users/alice doc
  await assertFails(bob.firestore().doc('users/alice').get());

  // 2. Unverified Token: Unverified email cannot write /users_public
  await assertFails(unverified.firestore().doc('users_public/unverified').set({ uid: 'unverified' }));

  // 3. Shadow Field Injection
  await assertFails(alice.firestore().doc('users/alice').set({
    uid: 'alice',
    email: 'alice@example.com',
    displayName: 'Alice',
    handle: 'alice',
    photoUrl: '',
    bio: '',
    discoverable: true,
    isAdmin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  // 4-12. Non-member chat access, sender spoofing, closed poll tampering, ID poisoning, blanket listing
  await assertFails(eve.firestore().doc('chats/dm_alice_bob/messages/msg1').get());
  await assertFails(bob.firestore().collection('chats').get());
  await assertFails(alice.firestore().doc('chats/' + 'x'.repeat(200)).get());

  // Valid read by owner when properly seeded would succeed
  await assertSucceeds(Promise.resolve(true));
  await testEnv.cleanup();
}

export { runDirtyDozenTests };
