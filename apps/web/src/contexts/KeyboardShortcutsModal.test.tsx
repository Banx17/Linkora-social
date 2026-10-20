import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { KeyboardShortcutsModal } from "../components/KeyboardShortcutsModal";
import { KeyboardShortcutsProvider, useKeyboardShortcutsContext } from "./KeyboardShortcutsContext";

function TestConsumer() {
  const { openHelpModal } = useKeyboardShortcutsContext();
  return (
    <div>
      <button onClick={openHelpModal}>Open</button>
      <KeyboardShortcutsModal />
    </div>
  );
}

describe("KeyboardShortcutsModal", () => {
  it("renders modal with shortcuts", () => {
    render(
      <KeyboardShortcutsProvider>
        <TestConsumer />
      </KeyboardShortcutsProvider>
    );

    fireEvent.click(screen.getByText("Open"));

    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+K")).toBeInTheDocument();
  });

  it("closes when escape key is pressed", () => {
    render(
      <KeyboardShortcutsProvider>
        <TestConsumer />
      </KeyboardShortcutsProvider>
    );

    fireEvent.click(screen.getByText("Open"));

    const modal = screen.getByRole("dialog");
    fireEvent.keyDown(modal, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
