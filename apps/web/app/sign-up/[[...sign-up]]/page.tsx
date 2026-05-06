import { SignUp } from "@clerk/nextjs"

export default function Page() {
  return (
    <main className="dark grid min-h-svh place-items-center bg-[#09090b] px-4">
      <SignUp />
    </main>
  )
}
