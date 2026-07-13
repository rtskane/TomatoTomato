import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex justify-center px-4 py-12">
      <SignIn />
    </div>
  );
}
