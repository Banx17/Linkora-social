import { createGovernanceRouter } from "../governance";
import { Database } from "../../../db";
import { encodeCursor } from "../cursor";

function createMockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res;
}

async function invokeRoute(
  router: ReturnType<typeof createGovernanceRouter>,
  path: string,
  req: Record<string, unknown>
) {
  const layer = router.stack.find((item: any) => item.route?.path === path);
  if (!layer) throw new Error(`Route ${path} not found`);

  const res = createMockResponse();
  const stack = layer.route.stack;

  let i = 0;
  const next = () => {
    if (i < stack.length) {
      const handler = stack[i++].handle;
      handler(req, res, next);
    }
  };
  next();
  return res;
}

async function getProposals(query: Record<string, unknown>, db: Database) {
  const router = createGovernanceRouter(db);
  return invokeRoute(router, "/proposals", { query });
}

const MOCK_PROPOSAL = {
  proposal_id: 1n,
  proposer: "GPROPOSER123",
  parameter: "FeeBps",
  new_value: 500n,
  votes_for: 100n,
  votes_against: 50n,
  status: "Active",
  created_ledger: 100,
  updated_ledger: 100,
};

describe("governance API", () => {
  let db: jest.Mocked<Database>;

  beforeEach(() => {
    db = {
      listGovernanceProposalsCursor: jest.fn().mockResolvedValue({
        proposals: [MOCK_PROPOSAL],
        nextCursor: null,
      }),
    } as unknown as jest.Mocked<Database>;
  });

  it("lists proposals with default limit (no cursor)", async () => {
    const res = await getProposals({}, db);

    expect(db.listGovernanceProposalsCursor).toHaveBeenCalledWith({
      limit: 20,
      cursor: undefined,
    });
    expect(res.json).toHaveBeenCalledWith({
      proposals: [
        {
          proposal_id: "1",
          proposer: "GPROPOSER123",
          parameter: "FeeBps",
          new_value: "500",
          votes_for: "100",
          votes_against: "50",
          status: "Active",
          created_ledger: 100,
          updated_ledger: 100,
        },
      ],
      limit: 20,
      cursor: null,
      next_cursor: null,
      has_more: false,
    });
  });

  it("forwards cursor to the database method", async () => {
    const cursor = encodeCursor("1", "1");
    db.listGovernanceProposalsCursor = jest.fn().mockResolvedValue({
      proposals: [],
      nextCursor: null,
    });

    const res = await getProposals({ cursor }, db);

    expect(db.listGovernanceProposalsCursor).toHaveBeenCalledWith({
      limit: 20,
      cursor,
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ cursor, next_cursor: null, has_more: false })
    );
  });

  it("propagates next_cursor when more pages exist", async () => {
    const nextCursor = encodeCursor("2", "2");
    db.listGovernanceProposalsCursor = jest.fn().mockResolvedValue({
      proposals: [MOCK_PROPOSAL],
      nextCursor,
    });

    const res = await getProposals({ limit: "1" }, db);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        next_cursor: nextCursor,
        has_more: true,
      })
    );
  });

  it("lists proposals with a custom limit", async () => {
    const res = await getProposals({ limit: "5" }, db);

    expect(db.listGovernanceProposalsCursor).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 })
    );
  });

  it("rejects invalid limit with 400", async () => {
    const res = await getProposals({ limit: "-1" }, db);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.listGovernanceProposalsCursor).not.toHaveBeenCalled();
  });

  it("rejects an object-shaped cursor with 400", async () => {
    const res = await getProposals({ cursor: { a: "b" } }, db);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.listGovernanceProposalsCursor).not.toHaveBeenCalled();
  });

  it("rejects a non-base64 cursor with 400", async () => {
    const res = await getProposals({ cursor: "not valid!!!" }, db);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.listGovernanceProposalsCursor).not.toHaveBeenCalled();
  });
});
