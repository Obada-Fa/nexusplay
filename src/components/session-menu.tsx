"use client";
import type { RemoteCommand, SessionState } from "@/types/socket";

export function SessionMenu({ state, enabled, command }: { state: SessionState; enabled: boolean; command: (action: RemoteCommand) => void }) {
  if (!state.paused) return null;
  return <div className="session-overlay" role="dialog" aria-modal="true" aria-label="Game paused">
    <div className="session-panel">
      <p className="text-xs uppercase tracking-widest text-violet-300">{state.gameName} · Paused</p>
      <h2 className="text-2xl font-bold">{state.confirm ? `${state.confirm === "restart" ? "Restart game" : "Return to lobby"}?` : "Game menu"}</h2>
      {!enabled ? <p>{state.controllerName || "The host"} controls this menu.</p> : state.confirm ? <>
        <p>This ends the current game for everyone.</p>
        <button autoFocus onClick={() => command("cancel")}>Cancel</button>
        <button onClick={() => command("confirm")}>Confirm {state.confirm === "restart" ? "restart" : "return to lobby"}</button>
      </> : <>
        {(["resume", "restart", "lobby"] as const).map((action, i) => <button autoFocus={i === 0} className={state.menuIndex === i ? "selected" : ""} key={action} onClick={() => command(action)}>{["Resume", "Restart game", "Return to lobby"][i]}</button>)}
        <div className="flex gap-2"><button aria-label="Previous menu item" onClick={() => command("up")}>↑</button><button onClick={() => command("select")}>Select</button><button aria-label="Next menu item" onClick={() => command("down")}>↓</button></div>
      </>}
    </div>
  </div>;
}
