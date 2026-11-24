import { Suspense } from "react";

import { LoginInner } from "./login-inner";



export default function LoginPage() {

  const ownerEmailHint = process.env.NEXT_PUBLIC_OWNER_EMAIL_HINT?.trim() || null;

  return (

    <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Loading</p>}>

      <LoginInner ownerEmailHint={ownerEmailHint} />

    </Suspense>

  );

}
