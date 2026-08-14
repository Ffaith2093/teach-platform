import "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    role: "ADMIN" | "TEACHER" | "STUDENT";
    mustChangePassword: boolean;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: "ADMIN" | "TEACHER" | "STUDENT";
      mustChangePassword: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "TEACHER" | "STUDENT";
    name: string;
    mustChangePassword: boolean;
  }
}
