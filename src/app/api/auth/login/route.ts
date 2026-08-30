import { NextResponse } from "next/server";
import { authenticate, setSessionCookie } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.email || !body?.password) {
      return NextResponse.json({ error: "Email dan kata sandi wajib diisi" }, { status: 400 });
    }
    const user = await authenticate(body.email, body.password);
    if (!user) {
      return NextResponse.json({ error: "Email atau kata sandi salah" }, { status: 401 });
    }
    await setSessionCookie(user);
    await logAudit({ actorName: user.name, action: "LOGIN", entity: "User", entityId: user.id });
    return NextResponse.json({ user });
  } catch (e) {
    console.error("login error", e);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
