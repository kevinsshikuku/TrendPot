export class ProfileCompletionRequiredError extends Error {
  constructor(readonly missingFields: string[], message?: string) {
    super(message ?? "Complete your profile to continue.");
    this.name = "ProfileCompletionRequiredError";
  }
}
