// The shape /api/quote returns, shared (types only) by the server and the quote page so the
// two can't drift apart. Contains no rates, no breakdown -- only what a customer may see.
export type QuoteApiResult =
  | {
      kind: "price";
      reference: string;
      /** The single flat price, GST included. */
      amountAud: number;
      includes: string[];
      firstMoveApplied: boolean;
      /** They asked for the first-move offer but it has already been used with these details. */
      firstMoveDenied: boolean;
      /** yyyy-mm-dd */
      validUntil: string;
      emailed: boolean;
      /** Priced from a placeholder rate card (dev/preview only) -- show a clear test banner. */
      testMode: boolean;
    }
  | { kind: "manual"; reference: string; emailed: boolean };
