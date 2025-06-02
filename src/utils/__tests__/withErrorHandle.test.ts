// utils/withErrorHandle.test.ts
import { withErrorHandle } from "../withErrorHandle";

type DummyInfo = {}; // we don’t actually use GraphQLResolveInfo in these tests

describe("withErrorHandle", () => {
  const dummyParent = {};
  const dummyArgs = {};
  const dummyContext = {};
  const dummyInfo = {} as DummyInfo;

  it("returns the underlying resolver’s value when it resolves successfully", async () => {
    const resolver = jest.fn().mockResolvedValue("RESULT_OK");
    const wrapped = withErrorHandle(resolver);

    const result = await wrapped(
      dummyParent,
      dummyArgs,
      dummyContext,
      dummyInfo as any
    );
    expect(result).toBe("RESULT_OK");
    expect(resolver).toHaveBeenCalledWith(
      dummyParent,
      dummyArgs,
      dummyContext,
      dummyInfo as any
    );
  });

  it("propagates errors thrown by the underlying resolver", async () => {
    const testError = new Error("Something went wrong");
    const resolver = jest.fn().mockRejectedValue(testError);
    const wrapped = withErrorHandle(resolver);

    await expect(
      wrapped(dummyParent, dummyArgs, dummyContext, dummyInfo as any)
    ).rejects.toThrow("Something went wrong");
    expect(resolver).toHaveBeenCalledWith(
      dummyParent,
      dummyArgs,
      dummyContext,
      dummyInfo as any
    );
  });

  it("catches synchronous exceptions and rethrows them", async () => {
    const syncError = new Error("Sync error");
    // A resolver that throws synchronously instead of returning a rejected promise
    const resolver = jest.fn().mockImplementation(() => {
      throw syncError;
    });
    const wrapped = withErrorHandle(resolver);

    await expect(
      wrapped(dummyParent, dummyArgs, dummyContext, dummyInfo as any)
    ).rejects.toThrow("Sync error");
    expect(resolver).toHaveBeenCalledWith(
      dummyParent,
      dummyArgs,
      dummyContext,
      dummyInfo as any
    );
  });
});
