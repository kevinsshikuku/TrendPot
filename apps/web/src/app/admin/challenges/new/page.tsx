import { CreateChallengeForm } from "../../../../components/admin/create-challenge-form";

export default function NewChallengePage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Create a challenge</h1>
        <p className="text-sm text-slate-300">
          Publish new creator challenges, set fundraising goals, and control visibility without touching the codebase.
        </p>
      </header>
      <CreateChallengeForm />
    </div>
  );
}
