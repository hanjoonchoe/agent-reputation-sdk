/**
 * Error style (R-4, decided): typed classes extending a common base, matching viem's own
 * idiom (`BaseError` and friends) rather than a `Result<T, E>` envelope. Every thrown
 * error is one of the subclasses below — no raw viem/JS exception is ever allowed to
 * cross an action's boundary uncaught. Upstream error messages (RPC errors, fetch
 * failures) are sanitized to their first line, capped at 300 chars, before being carried
 * as `.message` here — full detail (including stack) is preserved on `.cause` for
 * anyone who wants it (a lesson carried over from `web3-agents-mcp`, whose bridge-level
 * error messages could otherwise balloon with multi-KB revert data / provider HTML error
 * pages).
 */

const MAX_MESSAGE_LENGTH = 300;

/** Sanitizes an upstream error into a short, single-line, boundedly-sized message. */
export function sanitizeMessage(input: unknown): string {
  const raw = input instanceof Error ? input.message : String(input);
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? raw;
  return firstLine.length > MAX_MESSAGE_LENGTH
    ? `${firstLine.slice(0, MAX_MESSAGE_LENGTH)}…`
    : firstLine;
}

export class Erc8004Error extends Error {
  override readonly name: string = "Erc8004Error";
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.cause = options?.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when `agentId` has no registered owner (ERC-721 `ownerOf`/`tokenURI` revert). */
export class AgentNotFoundError extends Erc8004Error {
  override readonly name = "AgentNotFoundError";
  readonly agentId: bigint;

  constructor(agentId: bigint, options?: { cause?: unknown }) {
    super(`agent ${agentId} is not registered`, options);
    this.agentId = agentId;
  }
}

/** Thrown when `client.chain` is missing or not one of the 7 configured ERC-8004 chains. */
export class ChainUnsupportedError extends Erc8004Error {
  override readonly name = "ChainUnsupportedError";
  readonly chainId: number | undefined;

  constructor(chainId: number | undefined, options?: { cause?: unknown }) {
    super(
      chainId === undefined
        ? "client has no chain configured; erc8004Actions requires client.chain to be set"
        : `chainId ${chainId} is not a supported ERC-8004 chain`,
      options,
    );
    this.chainId = chainId;
  }
}

/** Wraps any non-revert RPC failure (network, timeout, decoding, multicall shortfall). */
export class RpcError extends Erc8004Error {
  override readonly name = "RpcError";

  constructor(cause: unknown) {
    super(sanitizeMessage(cause), { cause });
  }
}

/** Thrown when a registration file could not be fetched (network, timeout, size cap, malformed URI). */
export class FileUnreachableError extends Erc8004Error {
  override readonly name = "FileUnreachableError";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** Thrown when fetched bytes fail to hash-match their on-chain commitment (e.g. IPFS CID mismatch). */
export class FileHashMismatchError extends Erc8004Error {
  override readonly name = "FileHashMismatchError";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** Thrown for caller-supplied argument validation failures (bad limit/offset, malformed input). */
export class InvalidInputError extends Erc8004Error {
  override readonly name = "InvalidInputError";

  constructor(message: string) {
    super(message);
  }
}
