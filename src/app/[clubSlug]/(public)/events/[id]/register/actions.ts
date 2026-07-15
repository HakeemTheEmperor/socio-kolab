"use server";

/**
 * Public event-registration submit action.
 *
 * The full ordered, fail-closed validation + write flow is Phase 4
 * (EVENT-FORMS.md §4). This phase renders and wires the form; the contract
 * (`RegistrationState` + the bound `clubSlug`/`eventId` signature) is fixed here
 * so the client never changes when the body is filled in.
 */

export type RegistrationState = {
  ok?: boolean;
  /** A form-level message (resolution/intake/duplicate failures). */
  error?: string;
  /** Per-input messages, keyed by input name (`name`, `email`, `custom_{id}`). */
  fieldErrors?: Record<string, string>;
};

/* eslint-disable @typescript-eslint/no-unused-vars -- Phase 4 fills the body;
   the bound signature is fixed now so the client never changes. */
export async function submitEventRegistrationAction(
  clubSlug: string,
  eventId: string,
  prevState: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  // Placeholder until Phase 4. Fails closed so nothing is written.
  return { error: "Registration isn’t open yet. Please check back shortly." };
}
/* eslint-enable @typescript-eslint/no-unused-vars */
