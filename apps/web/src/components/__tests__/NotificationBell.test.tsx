import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationBell } from "../NotificationBell";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({
    address: "GBBD12345678",
    connected: true,
  }),
}));

const mockMarkAllRead = jest.fn();
const mockMarkRead = jest.fn();
let mockNotifications: any[] = [];
let mockUnreadCount = 3;

jest.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: mockUnreadCount,
    markAllRead: mockMarkAllRead,
    markRead: mockMarkRead,
    markAllPending: false,
  }),
}));

jest.mock("@/services/notificationWS", () => ({
  getNotificationWSService: () => ({
    setAddress: jest.fn(),
    setTipThreshold: jest.fn(),
    connect: jest.fn(),
    onTipToast: jest.fn(() => () => {}),
  }),
}));

describe("NotificationBell (#1725)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnreadCount = 3;
    mockNotifications = [
      {
        id: "tip:1",
        type: "tip",
        actor: "GALICE12345678",
        amountXlm: 25,
        excerpt: "Insightful proposal discussion",
        timestamp: "2026-10-19T10:00:00Z",
        read: false,
      },
      {
        id: "follow:1",
        type: "follow",
        actor: "GCHARLIE9999",
        timestamp: "2026-10-19T09:30:00Z",
        read: false,
      },
      {
        id: "like:1",
        type: "like",
        actor: "GDAVID8888",
        postId: "post-123",
        excerpt: "Decentralized social future",
        timestamp: "2026-10-19T08:00:00Z",
        read: true,
      },
    ];
  });

  it("renders the bell button with accessible attributes and unread badge", () => {
    render(<NotificationBell />);

    const bell = screen.getByTestId("notifications-bell");
    expect(bell).toBeInTheDocument();
    expect(bell).toHaveAttribute("aria-label", "Notifications (3 unread)");
    expect(bell).toHaveAttribute("aria-expanded", "false");

    const badge = screen.getByTestId("unread-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("role", "status");
    expect(badge).toHaveTextContent("3");
  });

  it("hides unread badge when unreadCount is 0", () => {
    mockUnreadCount = 0;
    render(<NotificationBell />);

    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });

  it("opens the dropdown panel when bell is clicked and lists notifications", () => {
    render(<NotificationBell />);

    expect(screen.queryByTestId("notifications-dropdown")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("notifications-bell"));

    const dropdown = screen.getByTestId("notifications-dropdown");
    expect(dropdown).toBeInTheDocument();
    expect(dropdown).toHaveAttribute("role", "dialog");

    // Notifications content
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("3 unread")).toBeInTheDocument();
    expect(screen.getByText(/sent you a tip of/i)).toBeInTheDocument();
    expect(screen.getByText(/started following you/i)).toBeInTheDocument();
    expect(screen.getByText(/liked your post/i)).toBeInTheDocument();
  });

  it("calls markAllRead when 'Mark all as read' button is clicked", () => {
    render(<NotificationBell />);

    fireEvent.click(screen.getByTestId("notifications-bell"));
    const markAllBtn = screen.getByTestId("mark-all-read-btn");
    expect(markAllBtn).toBeInTheDocument();

    fireEvent.click(markAllBtn);
    expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it("calls markRead and routes to post when notification item is clicked", () => {
    render(<NotificationBell />);

    fireEvent.click(screen.getByTestId("notifications-bell"));

    const likeItem = screen.getByTestId("notification-item-like:1");
    fireEvent.click(likeItem);

    expect(mockMarkRead).toHaveBeenCalledWith("like:1");
    expect(mockPush).toHaveBeenCalledWith("/post/post-123");
    expect(screen.queryByTestId("notifications-dropdown")).not.toBeInTheDocument();
  });

  it("closes dropdown on Escape key", () => {
    render(<NotificationBell />);

    fireEvent.click(screen.getByTestId("notifications-bell"));
    expect(screen.getByTestId("notifications-dropdown")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("notifications-dropdown")).not.toBeInTheDocument();
  });

  it("shows empty state when there are no notifications", () => {
    mockNotifications = [];
    mockUnreadCount = 0;
    render(<NotificationBell />);

    fireEvent.click(screen.getByTestId("notifications-bell"));
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
  });
});
