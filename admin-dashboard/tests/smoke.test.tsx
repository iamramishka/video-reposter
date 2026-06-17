import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AdminDashboard from "../src/App";

describe("AdminDashboard smoke", () => {
  it("renders the sign-in shell without a browser session", () => {
    const html = renderToString(<AdminDashboard />);

    expect(html).toContain("Admin Dashboard");
    expect(html).toContain("Sign in to manage licenses and customers.");
    expect(html).toContain("Sign In");
  });
});
