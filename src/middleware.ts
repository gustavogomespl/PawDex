import { auth } from "@/auth";

export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  // Protect the place + account areas; /api/* routes enforce the session
  // themselves and /signin, /join, /terms stay public.
  matcher: ["/places", "/places/:path*", "/account"],
};
