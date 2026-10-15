import { AccountShell } from '../../components/account-shell';
import { ProfileForm } from '../../components/profile-form';
export const metadata = { title: 'Your profile | RoboNest' };
export default function ProfilePage() { return <AccountShell><ProfileForm /></AccountShell>; }
