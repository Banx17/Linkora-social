# Time-Locked Posts (commit-reveal)

Issue: #1774

A post whose content is published on chain before it can be read. The author
commits to the content by publishing only its hash, together with the earliest
timestamp at which the content may be revealed. The placeholder post is
visible in feeds and indexers right away, but the real content only becomes
readable once `reveal_time` has passed.

## Flow

1. The author picks the content and a salt, computes
   `sha256(salt || content)` and calls `commit_post`.
2. The contract creates the placeholder post and stores the commit state
   (`post_id`, `author`, `content_hash`, `reveal_time`, `timestamp`).
3. After `reveal_time`, the author calls `reveal_post(post_id, content)` with
   the exact content that was hashed.
4. The contract hashes the revealed content, compares it with the committed
   hash and, on a match, replaces the placeholder content and clears the
   commit state.

## Contract API

| Entrypoint | Arguments | Notes |
| --- | --- | --- |
| `commit_post` | `author: Address, content_hash: BytesN<32>, reveal_time: u64` | Returns the new `post_id`. Creates the placeholder post. |
| `reveal_post` | `author: Address, post_id: u64, content: String` | Replaces the placeholder content with the revealed content. |
| `get_committed_post` | `post_id: u64` | Returns the `CommittedPost` state, or `None` when the post is not committed (never committed or already revealed). |

The author is passed explicitly (the contract follows the `create_post`
pattern) and must authorise the call with `require_auth`.

## Revert conditions

| Message | Cause |
| --- | --- |
| `reveal time must be in the future` | `reveal_time` is not in the future at commit time. |
| `post is not committed: {post_id}` | The post was never committed (or was already revealed). |
| `only author can reveal post` | The caller is not the author of the commit. |
| `reveal time not reached` | The reveal is attempted before `reveal_time`. |
| `content hash mismatch` | The revealed content does not hash to the committed hash. |

## Hashing

The committed hash is the sha256 of the exact bytes of the revealed string:

```ts
import { createHash } from "crypto";

const salt = "deadbeef";
const content = "the real content";
const hash = createHash("sha256").update(salt + content).digest();
```

Because the salt is part of the hashed bytes, the committed hash never leaks
the content itself. The revealed string passed to `reveal_post` must be
exactly the string that was hashed (salt included, if used).

## Events

| Event | Topics | Data |
| --- | --- | --- |
| `post_committed` | version, post_id, author | content_hash, reveal_time |
| `post_revealed` | version, post_id, author | content_hash |

Both events are emitted by the contract and parsed by the SDK
(`post_committed` / `post_revealed` event types).

## SDK usage

```ts
import { createHash } from "crypto";

const client = new LinkoraClient({ contractId: "C...", rpcUrl: "https://..." });

const salt = "deadbeef";
const content = "the real content";
const hash = createHash("sha256").update(salt + content).digest();

// 1. Commit (placeholder post is created).
const tx = await client.prepareCommitPostTx(author, hash, revealTime);

// 2. Reveal once reveal_time has passed.
const tx2 = await client.prepareRevealPostTx(author, postId, salt + content);

// Read the commit state.
const committed = await client.getCommittedPost(postId);
```
