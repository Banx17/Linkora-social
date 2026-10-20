# Multi-Device DM Key Distribution Design

**Status:** Design Document  
**Issue:** #1652  
**Version:** 1.0.0

---

## Problem Statement

Currently, the Linkora contract stores a single X25519 public key per user (`DmPublicKey`). When a user operates multiple devices (mobile, web, desktop), each device generates its own DM keypair. Because only one key is published on-chain, only the device that published its key can decrypt incoming DMs.

**Example:**
- Alice's mobile publishes `PK_mobile_1`
- Alice's web client publishes `PK_web_1`, overwriting the contract value
- Bob sends a DM to Alice encrypted with `PK_web_1` (the currently published key)
- Alice's mobile cannot decrypt the message since it holds `SK_mobile_1`, not `SK_web_1`

---

## Solution: Multi-Device Key Registry

### 1. Contract-Level Changes

Store a **map of versioned public keys per user** instead of a single key:

```rust
// Current (single key)
dm_public_keys: Map<Address, Bytes32>

// Proposed (multi-device)
dm_public_keys: Map<Address, Vec<DmPublicKeyEntry>>

#[derive(Serialize, Deserialize, Clone)]
pub struct DmPublicKeyEntry {
    pub public_key: Bytes32,          // The X25519 public key
    pub device_id: String,             // Unique device identifier (e.g., "mobile", "web-001")
    pub published_at: u64,             // Ledger sequence when published
    pub revoked_at: Option<u64>,       // Ledger sequence when revoked (None = active)
}
```

### 2. SDK & Client-Side Implementation

#### Step 1: Generate & Store Device ID

Each device should generate a stable, non-identifiable device ID on first use:

```typescript
function getOrCreateDeviceId(): string {
  const stored = localStorage.getItem("linkora:device_id");
  if (stored) return stored;
  
  const id = generateRandomId(); // Cryptographically random 16-char string
  localStorage.setItem("linkora:device_id", id);
  return id;
}
```

#### Step 2: Publish DM Public Key with Device ID

When publishing a key, include the device ID in a new contract entry-point:

```typescript
// In SDK
async function publishDmPublicKey(deviceId: string, publicKey: Uint8Array): Promise<void> {
  const contract = new LinkoraContract(rpcUrl, contractId);
  await contract.invoke("publish_dm_key", {
    device_id: deviceId,
    public_key: publicKey,
  });
}
```

#### Step 3: Retrieve All Active Keys for a User

Instead of fetching a single key, fetch all active (non-revoked) keys:

```typescript
async function getUserDmPublicKeys(userAddress: string): Promise<DmPublicKeyEntry[]> {
  const contract = new LinkoraContract(rpcUrl, contractId);
  const keys = await contract.read("get_dm_public_keys", { user: userAddress });
  return keys.filter((k) => k.revoked_at === null);
}
```

#### Step 4: Multi-Key Message Encryption

When Alice sends a DM to Bob, she now encrypts the message for **each of Bob's active keys**:

```typescript
async function sendMultiDeviceDm(
  recipientAddress: string,
  plaintext: string,
  senderDmKeyPair: DmKeyPair
): Promise<void> {
  // Fetch all of Bob's active DM public keys
  const bobKeys = await getUserDmPublicKeys(recipientAddress);
  
  // For each of Bob's devices, encrypt a copy of the message
  const ciphertexts = [];
  for (const keyEntry of bobKeys) {
    const sharedSecret = X25519(senderDmKeyPair.privateKey, keyEntry.public_key);
    const conversationId = createConversationId(senderAddress, recipientAddress);
    const conversationKey = deriveConversationKey(sharedSecret, conversationId);
    const nonce = deriveNonce(conversationKey, messageIndex);
    
    const ciphertext = ChaCha20Poly1305.encrypt(
      conversationKey,
      nonce,
      plaintext,
      keyEntry.device_id // AAD includes device ID for binding
    );
    
    ciphertexts.push({
      device_id: keyEntry.device_id,
      ciphertext_b64: ciphertext,
      message_index: messageIndex,
    });
  }
  
  // Send to relay in a batch envelope
  await relay.post("/messages/multi-device", {
    sender: senderAddress,
    recipient: recipientAddress,
    timestamp: Math.floor(Date.now() / 1000),
    messages: ciphertexts,
    signature: signMultiDeviceEnvelope(...),
  });
}
```

### 3. Relay Service Changes

#### New Endpoint: `POST /messages/multi-device`

```typescript
app.post("/messages/multi-device", async (req, res) => {
  const {
    sender,
    recipient,
    timestamp,
    messages,
    signature,
  } = req.body;
  
  // Verify the sender's Ed25519 signature covers all messages
  const signable = buildMultiDeviceSignable(recipient, timestamp, messages);
  verify(sender, signature, signable);
  
  // Store one DB row per device's ciphertext
  for (const msg of messages) {
    await db.saveMessage({
      conversation_id: createConversationId(sender, recipient),
      sender,
      recipient,
      device_id: msg.device_id,
      ciphertext_b64: msg.ciphertext_b64,
      message_index: msg.message_index,
      timestamp,
    });
  }
  
  // Push to all of recipient's active WebSocket connections
  // (they'll each try to decrypt with their own private key)
  await pushToRecipient(recipient, {
    type: "new_message",
    sender,
    messages, // All device ciphertexts bundled
    timestamp,
  });
  
  res.status(201).json({ conversation_id });
});
```

#### Updated WebSocket Push

Each of the recipient's devices receives all message copies and attempts decryption:

```typescript
// On client (any device)
ws.on("message", (event) => {
  if (event.type === "new_message") {
    const { messages, sender } = event;
    
    // Try to decrypt with my device's private key
    for (const msg of messages) {
      try {
        const sharedSecret = X25519(myDmKeyPair.privateKey, senderPublicKey);
        const conversationKey = deriveConversationKey(sharedSecret, conversationId);
        const nonce = deriveNonce(conversationKey, msg.message_index);
        
        // AAD includes sender's device ID
        const plaintext = ChaCha20Poly1305.decrypt(
          conversationKey,
          nonce,
          msg.ciphertext_b64,
          sender // or msg.device_id
        );
        
        displayMessage(plaintext);
        break; // Successfully decrypted with my key
      } catch {
        // Not encrypted for my device, ignore
        continue;
      }
    }
  }
});
```

### 4. Key Rotation & Revocation

#### Automatic Rotation

Devices should rotate DM keypairs periodically (recommended: quarterly):

```typescript
async function rotateDeviceDmKey(): Promise<void> {
  // Generate new keypair
  const newKeyPair = generateDmKeypair();
  const deviceId = getOrCreateDeviceId();
  
  // Store new private key locally
  await encryptedStorage.put("dm_private_key", newKeyPair.privateKey);
  
  // Publish new public key
  await publishDmPublicKey(deviceId, newKeyPair.publicKey);
  
  // Emit event for history tracking
  emitEvent("dm_key_rotated", { deviceId, timestamp: Date.now() });
}
```

#### Manual Revocation

Users can revoke a device's key explicitly:

```typescript
async function revokeDmKey(deviceId: string): Promise<void> {
  const contract = new LinkoraContract(rpcUrl, contractId);
  await contract.invoke("revoke_dm_key", { device_id: deviceId });
}
```

---

## Event Emissions

### Existing: `DmKeyPublishedEvent`

Update to include device ID:

```typescript
export type DmKeyPublishedEvent = BaseLinkoraEvent & {
  type: "dm_key_published";
  user: string;
  device_id: string;           // NEW
  public_key: Uint8Array;
  published_at: number;        // NEW: ledger sequence
};
```

### New: `DmKeyRevokedEvent`

```typescript
export type DmKeyRevokedEvent = BaseLinkoraEvent & {
  type: "dm_key_revoked";
  user: string;
  device_id: string;
  revoked_at: number;         // Ledger sequence
};
```

Both events are already parseable via the existing `parseContractEvent` function since they follow the standard pattern.

---

## Migration Strategy

1. **Phase 1 (Backwards Compat):**
   - Contract stores both single key AND multi-device array
   - SDK publishes to both formats
   - Relay accepts both legacy and multi-device message endpoints

2. **Phase 2 (Deprecation):**
   - Mark single-key endpoint as deprecated
   - Require multi-device format for new clients
   - Warn on single-key publishes

3. **Phase 3 (Cleanup):**
   - Remove single-key support entirely

---

## Security Considerations

1. **Device ID Privacy:**
   - Device IDs are not secrets and may appear in logs/events
   - Use generic identifiers ("mobile", "web-001") rather than hardware identifiers
   - Never include version numbers or hardware details

2. **Replay Prevention:**
   - Existing timestamp validation (30-second tolerance) remains
   - Database constraint on `(conversation_id, sender, message_index)` still applies

3. **Forward Secrecy:**
   - Each device's private key is independent
   - Compromised device key does not leak old messages to other devices
   - Recommend key rotation every 90 days

4. **Metadata Leakage:**
   - The count of active keys per user is observable by relay operators
   - Consider batching key publishes to hide device count

---

## Implementation Checklist

- [ ] Update contract event definitions and emitter
- [ ] Implement `publish_dm_key` and `revoke_dm_key` contract entry-points
- [ ] Update SDK to generate and manage device IDs
- [ ] Add `getUserDmPublicKeys` function to SDK
- [ ] Implement multi-device message encryption in SDK
- [ ] Add `/messages/multi-device` endpoint to relay
- [ ] Update WebSocket message handling to broadcast all copies
- [ ] Add database schema for `device_id` field
- [ ] Implement automatic key rotation CLI tool
- [ ] Add integration tests for multi-device encryption/decryption

---

## References

- Original Issue: #1652
- Related DM Relay Protocol: `/docs/dm-relay/PROTOCOL.md`
- X25519 & ChaCha20-Poly1305: RFC 7748, RFC 8439
