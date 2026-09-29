import type { GraphQLResolveInfo } from "graphql";
import type { Context } from "../../src/graphql/context.js";
import type { Resolver } from "../../src/graphql/generated/types.js";
import type { IUser } from "../../src/models/User.js";

/**
 * Only what the resolver under test reads: no `res` unless it sets cookies,
 * and a fake User can be as small as `{ id }`.
 */
export type TestContext = Omit<Partial<Context>, "user"> & {
  user?: Partial<IUser> | null;
};

/** What the client gets: codegen lets a resolver return a promise at any list item. */
type Resolved<T> =
  T extends Promise<infer U>
    ? Resolved<U>
    : T extends (infer E)[]
      ? Resolved<E>[]
      : T;

/**
 * Calls a resolver typed through its generated signature the way Apollo does,
 * with the args it declares and a partial context.
 */
export async function callResolver<TResult, TArgs>(
  resolver: Resolver<TResult, {}, Context, TArgs> | undefined,
  args: TArgs,
  context: TestContext = {},
): Promise<Resolved<TResult>> {
  if (!resolver) throw new Error("The resolver is not defined");
  const resolve = typeof resolver === "function" ? resolver : resolver.resolve;
  // Every resolver here returns plain values; none puts promises in a list.
  return (await resolve(
    {},
    args,
    context as Context,
    {} as GraphQLResolveInfo,
  )) as Resolved<TResult>;
}
