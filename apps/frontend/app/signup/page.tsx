import { AccountShell } from '../../components/account-shell';
import { AuthForm } from '../../components/auth-form';
export const metadata = { title: 'Create account | RoboNest' };
export default function SignupPage() { return <AccountShell><AuthForm mode="signup" /></AccountShell>; }
