import { ok } from "@/lib/dintel/http";
import fs from "fs"; import path from "path";
export const dynamic = "force-dynamic";
export async function GET() {
  const dir = path.join(process.cwd(), "tests", "fixtures", "janrakshak");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  return ok({ fixtures: files.map((f) => ({ name: f.replace(".json", ""), payload: JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) })) });
}
