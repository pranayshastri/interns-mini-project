import { notFound } from "next/navigation";
import { ProfilePreview } from "../../components/profile-preview";

export const metadata = {
  title: "Account design review | RoboNest",
  robots: { index: false, follow: false },
};

export default function Page() {
  // Next.js sets NODE_ENV; this route is only available during design review.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.NODE_ENV !== "development") notFound();
  return <ProfilePreview />;
}
