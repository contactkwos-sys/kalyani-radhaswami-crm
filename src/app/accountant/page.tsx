import { redirect } from "next/navigation";

/** Legacy role home — always open the real CRM dashboard. */
export default function AccountantPage() {
  redirect("/dashboard");
}
