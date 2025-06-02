// utils/withAuth.test.ts
import { withAuth } from "../withAuth";

type DummyInfo = {}; // we don’t actually use GraphQLResolveInfo in these tests

describe("withAuth", () => {
  const dummyParent = {};
  const dummyArgs = {};
  const dummyInfo = {} as DummyInfo;

  const makeContext = (user: { emailConfirmed: boolean } | null) => ({
    currentUser: user,
  });

  it("throws 'Unauthenticated!' if currentUser is null", async () => {
    const resolver = jest.fn().mockResolvedValue("DONE");
    const wrapped = withAuth(resolver);

    const context = makeContext(null);

    await expect(
      wrapped(dummyParent, dummyArgs, context, dummyInfo as any)
    ).rejects.toThrow("Unauthenticated!");
    expect(resolver).not.toHaveBeenCalled();
  });

  it("throws 'Please confirm your email before continuing' if emailConfirmed is false", async () => {
    const resolver = jest.fn().mockResolvedValue("DONE");
    const wrapped = withAuth(resolver);

    const context = makeContext({ emailConfirmed: false });

    await expect(
      wrapped(dummyParent, dummyArgs, context, dummyInfo as any)
    ).rejects.toThrow("Please confirm your email before continuing");
    expect(resolver).not.toHaveBeenCalled();
  });

  it("calls the original resolver when user is authenticated and emailConfirmed is true", async () => {
    const resolver = jest.fn().mockResolvedValue("SUCCESS");
    const wrapped = withAuth(resolver);

    const context = makeContext({ emailConfirmed: true });

    const result = await wrapped(
      dummyParent,
      dummyArgs,
      context,
      dummyInfo as any
    );
    expect(result).toBe("SUCCESS");
    expect(resolver).toHaveBeenCalledWith(
      dummyParent,
      dummyArgs,
      context,
      dummyInfo as any
    );
  });
});
