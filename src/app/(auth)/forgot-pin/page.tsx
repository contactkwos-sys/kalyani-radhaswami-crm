import { redirect } from "next/navigation";

/** Mobile/OTP Forgot PIN removed — use Admin PIN reset or first-time Set PIN. */
export default function ForgotPinPage() {
  redirect("/login");
}
