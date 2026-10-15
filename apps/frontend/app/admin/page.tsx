import { Guard } from "../../components/feedback/states";
import { AdminWorkspace } from "../../components/admin/admin-workspace";

export const metadata = { title: "Administration | RoboNest" };

export default function Page() {
  return (
    <Guard role="ADMIN">
      <AdminWorkspace />
    </Guard>
  );
}
