import { NotificationWSService } from "../notificationWS";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: any }) => void) | null = null;
  onerror: ((error: any) => void) | null = null;
  onclose: (() => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.onopen?.();
    }, 10);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }
}

describe("NotificationWSService (#1725)", () => {
  let originalWebSocket: any;

  beforeEach(() => {
    originalWebSocket = (global as any).WebSocket;
    (global as any).WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
    jest.useFakeTimers();
  });

  afterEach(() => {
    (global as any).WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  it("connects to websocket and sends subscribe action on open", () => {
    const service = new NotificationWSService({
      url: "ws://localhost:3001/ws",
      address: "GBBD12345678",
    });

    service.connect();
    expect(MockWebSocket.instances.length).toBe(1);

    jest.advanceTimersByTime(15);

    const ws = MockWebSocket.instances[0];
    expect(ws.sentMessages.length).toBe(1);
    const sub = JSON.parse(ws.sentMessages[0]);
    expect(sub.action).toBe("subscribe");
    expect(sub.types).toContain("tip");
    expect(sub.address).toBe("GBBD12345678");

    service.disconnect();
  });

  it("dispatches incoming notifications to listeners", () => {
    const service = new NotificationWSService({
      address: "GBBD12345678",
    });
    service.connect();
    jest.advanceTimersByTime(15);

    const ws = MockWebSocket.instances[0];
    const listener = jest.fn();
    service.onNotification(listener);

    ws.onmessage?.({
      data: JSON.stringify({
        type: "follow",
        payload: {
          data: {
            follower: "GALICE1234",
            followee: "GBBD12345678",
            ledgerClosedAt: "2026-10-19T10:00:00Z",
          },
        },
      }),
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "follow",
        actor: "GALICE1234",
      })
    );

    service.disconnect();
  });

  it("fires toast callback when tip exceeds configured threshold", () => {
    const service = new NotificationWSService({
      address: "GBBD12345678",
      tipToastThresholdXlm: 5,
    });
    service.connect();
    jest.advanceTimersByTime(15);

    const ws = MockWebSocket.instances[0];
    const toastListener = jest.fn();
    service.onTipToast(toastListener);

    // Tip of 200,000,000 stroops = 20 XLM (> 5 XLM threshold)
    ws.onmessage?.({
      data: JSON.stringify({
        type: "tip",
        payload: {
          data: {
            tipper: "GALICE1234",
            amount: "200000000",
            post_id: "post_999",
            excerpt: "Great protocol analysis!",
          },
        },
      }),
    });

    expect(toastListener).toHaveBeenCalledWith(
      expect.objectContaining({
        tipper: "GALICE1234",
        amountXlm: 20,
        excerpt: "Great protocol analysis!",
      })
    );

    service.disconnect();
  });

  it("does not fire toast callback when tip is below threshold", () => {
    const service = new NotificationWSService({
      address: "GBBD12345678",
      tipToastThresholdXlm: 10,
    });
    service.connect();
    jest.advanceTimersByTime(15);

    const ws = MockWebSocket.instances[0];
    const toastListener = jest.fn();
    service.onTipToast(toastListener);

    // Tip of 20,000,000 stroops = 2 XLM (< 10 XLM threshold)
    ws.onmessage?.({
      data: JSON.stringify({
        type: "tip",
        payload: {
          data: {
            tipper: "GALICE1234",
            amount: "20000000",
            post_id: "post_999",
          },
        },
      }),
    });

    expect(toastListener).not.toHaveBeenCalled();

    service.disconnect();
  });

  it("reconnects automatically with backoff after connection close", () => {
    const service = new NotificationWSService({
      url: "ws://localhost:3001/ws",
    });
    service.connect();
    jest.advanceTimersByTime(15);

    expect(MockWebSocket.instances.length).toBe(1);

    // Simulate drop
    MockWebSocket.instances[0].close();
    expect(service.getStatus()).toBe("reconnecting");

    // Advance 1s (first exponential backoff delay)
    jest.advanceTimersByTime(1050);
    expect(MockWebSocket.instances.length).toBe(2);

    service.disconnect();
  });
});
