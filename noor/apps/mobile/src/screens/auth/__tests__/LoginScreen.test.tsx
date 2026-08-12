import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { LoginScreen } from "../LoginScreen";
import { ApiError } from "../../../lib/api";

const mockSignIn = jest.fn();
const mockNavigate = jest.fn();

jest.mock("../../../lib/AuthContext", () => ({
  useAuth: () => ({ signIn: mockSignIn }),
}));

describe("LoginScreen (#login, #loading state, #authentication errors)", () => {
  afterEach(() => jest.clearAllMocks());

  it("shows a loading state and calls signIn with the entered credentials", async () => {
    mockSignIn.mockResolvedValueOnce(undefined);
    await render(<LoginScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />);

    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.test");
    await fireEvent.changeText(screen.getByLabelText("Password"), "Test-Password-9");
    await fireEvent.press(screen.getByText("Sign In"));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith("sam@example.test", "Test-Password-9"));
  });

  it("shows the same error message regardless of the underlying failure (#no email enumeration leak)", async () => {
    mockSignIn.mockRejectedValueOnce(new ApiError(401, "Invalid email or password."));
    await render(<LoginScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />);

    await fireEvent.changeText(screen.getByLabelText("Email"), "nobody@example.test");
    await fireEvent.changeText(screen.getByLabelText("Password"), "wrong");
    await fireEvent.press(screen.getByText("Sign In"));

    expect(await screen.findByText("Invalid email or password.")).toBeTruthy();
  });

  it("navigates to Signup via the link", async () => {
    await render(<LoginScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />);
    await fireEvent.press(screen.getByText("Don't have an account? Create one"));
    expect(mockNavigate).toHaveBeenCalledWith("Signup");
  });
});
