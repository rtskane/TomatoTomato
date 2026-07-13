import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex justify-center px-4 py-12">
      <SignUp />
    </div>
  );
}
