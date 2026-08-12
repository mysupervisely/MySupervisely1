import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

// A deliberate regression guard: @testing-library/react-native's `render`
// is async in this version (it awaits React's async act() internally, to
// support Suspense/use()) — unlike the classic RTL/RNTL pattern, EVERY
// call site in this app's tests must `await render(...)`. Forgetting the
// await doesn't throw; it silently leaves `screen` unbound, which is a
// confusing failure to debug from scratch — this test exists so that
// confusion never has to be rediscovered.
describe("sanity", () => {
  it("await render(...) is required in this RNTL version", async () => {
    await render(<Text>hello</Text>);
    expect(screen.getByText("hello")).toBeTruthy();
  });
});
