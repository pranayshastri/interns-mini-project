import { notFound } from "next/navigation";
import { AdminWorkspace } from "../../components/admin/admin-workspace";

export const metadata = {
  title: "Admin design review | RoboNest",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AdminWorkspace preview />;
}
