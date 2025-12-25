import "@aws-amplify/ui-react/styles.css";
import { Authenticator } from "@aws-amplify/ui-react";
import { TripsPage } from "./pages/TripsPage";

export default function App() {
  return (
    <div className="page">
      <div className="card auth-card">
        <Authenticator>
          {({ signOut, user }) => (
            <div>
              <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0 }}>Travel Expenses</h2>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 14, opacity: 0.8 }}>{user?.signInDetails?.loginId}</span>
                  <button className="btn btn-muted" onClick={signOut}>Sign out</button>
                </div>
              </header>
              <hr style={{ opacity: 0.25 }} />
              <TripsPage />
            </div>
          )}
        </Authenticator>
      </div>
    </div>
  );
}
