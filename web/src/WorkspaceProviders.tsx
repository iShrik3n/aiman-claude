import { useState } from "react";
import CredentialSets from "./CredentialSets";
import WorkspaceConfig from "./WorkspaceConfig";
import WorkspaceOps from "./WorkspaceOps";

type Tab = "models" | "credentials";

export default function WorkspaceProviders({
  directory,
  onChanged,
}: {
  directory: string;
  onChanged?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("models");
  return (
    <div className="ws-section">
      <div className="ext-subtabs">
        <button className={"tab" + (tab === "models" ? " active" : "")} onClick={() => setTab("models")}>
          Models
        </button>
        <button
          className={"tab" + (tab === "credentials" ? " active" : "")}
          onClick={() => setTab("credentials")}
        >
          Credentials
        </button>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Models defines providers and model choices for the selected scope. Credentials is the
        single place for live provider auth and saved API-key sets; credentials are server-wide.
      </p>
      {tab === "models" ? (
        <WorkspaceConfig directory={directory} mode="providers" onChanged={onChanged} />
      ) : (
        <>
          <WorkspaceOps mode="auth" directory={directory} onChanged={onChanged} />
          <CredentialSets />
        </>
      )}
    </div>
  );
}
