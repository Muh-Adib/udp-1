import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/** Daftar staff untuk dropdown penugasan. */
export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const users = await db.user.findMany({
    where: { role: { in: ["OWNER", "MANAGER", "MARKETER"] }, active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ users });
}
