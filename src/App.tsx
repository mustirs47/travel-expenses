import "@aws-amplify/ui-react/styles.css";
import { Authenticator } from "@aws-amplify/ui-react";
import { TripsPage } from "./pages/TripsPage";

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <div className="card">{children}</div>
    </div>
  );
}

function AuthShell() {
  return (
    <div className="page">
      <div className="card auth">
        <Authenticator />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => {
        if (!user) return <AuthShell />;

        return (
          <AppShell>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>Travel Expenses</h2>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 14, opacity: 0.8 }}>{user?.signInDetails?.loginId}</span>
                <button className="btn btn-muted" onClick={signOut}>Sign out</button>
              </div>
            </header>
            <hr style={{ opacity: 0.25 }} />
            <TripsPage />
          </AppShell>
        );
      }}
    </Authenticator>
  );
}
