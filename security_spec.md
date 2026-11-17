# BaatCheet Security Specification

## 1. Data Invariants
1. **PII Isolation**: Email addresses live exclusively in `/users/{userId}` and are readable/writable only by `request.auth.uid == userId`. `/users_public/{userId}` and `/handles/{handleId}` contain zero PII.
2. **Verified Identity**: All authenticated reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Chat Membership Gate**: Only users whose UID is in `chat.memberUids` can read a chat, read/send messages, create polls, or vote in polls. Joining a group requires matching `chat.inviteCode` via `lastInviteUsed`.
4. **Sender Integrity**: A message's `senderId`, a poll's `createdBy`, and a vote's `voterId` must always match `request.auth.uid` and remain immutable after creation.
5. **Terminal State Locking**: Once a `Poll` has `isClosed == true`, no further votes (`create`/`update`/`delete`) or poll modifications are allowed.
6. **Temporal Integrity**: All `createdAt`, `updatedAt`, `lastSeen`, and `lastMessageAt` timestamps must equal `request.time`.
7. **Bounded Payloads**: Every string and array (`memberUids <= 50`, `adminUids <= 20`, `options` 2..6, `imageData <= 450000`, `text <= 2000`) is strictly bounded in `firestore.rules` and client validation.
8. **Query Enforcement**: Every `allow list` rule evaluates `resource.data` directly without `get()` or `exists()`.

## 2. The "Dirty Dozen" Attack Payloads
1. **PII Snooping**: User B attempts `get` on `/users/{userA}` -> **PERMISSION_DENIED**.
2. **Email Spoof / Unverified Token**: Request with `email_verified: false` tries to create `/users_public/{uid}` -> **PERMISSION_DENIED**.
3. **Shadow Field Injection**: Create `/users/{uid}` with extra `isAdmin: true` ghost key -> **PERMISSION_DENIED**.
4. **Sender Spoofing**: User B creates message in shared chat with `senderId: userA` -> **PERMISSION_DENIED**.
5. **Non-Member Message Read/Write**: User C (not in `chat.memberUids`) creates message or reads `/chats/{chatId}/messages/{msgId}` -> **PERMISSION_DENIED**.
6. **Group Hijack Without Invite**: User C attempts to add themselves to `chat.memberUids` with wrong `lastInviteUsed` -> **PERMISSION_DENIED**.
7. **Receipt Manipulation**: User B updates message `text` or `senderId` when only `deliveredTo`/`readBy` are allowed for non-senders -> **PERMISSION_DENIED**.
8. **Vote Hijacking**: User B creates or updates `/votes/{userA}` -> **PERMISSION_DENIED**.
9. **Closed Poll Tampering**: User A votes on a poll where `isClosed == true` -> **PERMISSION_DENIED**.
10. **ID Poisoning**: Create document with 300-char ID or invalid characters `../admin` -> **PERMISSION_DENIED**.
11. **Timestamp Forgery**: Create message with client-backdated `createdAt` instead of `request.time` -> **PERMISSION_DENIED**.
12. **Blanket List Scraping**: User B runs unfiltered `list` on `/chats` or `/users` -> **PERMISSION_DENIED**.

## 3. Test Runner Reference
See `firestore.rules.test.ts` for the automated `@firebase/rules-unit-testing` verification suite covering all 12 attack vectors.
