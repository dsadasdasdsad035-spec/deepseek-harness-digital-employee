//#region src/invariant.ts
const PACKAGE_NAME = "@deepseek-ai/dsh-digital-employee-example-template";
/** Cordis companion plugin name. */
const name = "digital-employee-example-template-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No independent runtime invariant: the digital employee registry validates and owns each immutable
* template registration, while this package contributes no second mutable source to compare.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
