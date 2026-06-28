import { auth } from "@/auth";

export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  // Protect the place area; /api/* routes enforce the session themselves.
  matcher: ["/places", "/places/:path*"],
};
