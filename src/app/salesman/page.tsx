import { redirect } from "next/navigation";

/** Legacy role home — always open the real CRM dashboard. */
export default function SalesmanPage() {
  redirect("/dashboard");
}
