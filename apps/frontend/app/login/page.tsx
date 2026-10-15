import { AccountShell } from '../../components/account-shell';
import { AuthForm } from '../../components/auth-form';
export const metadata = { title: 'Sign in | RoboNest' };
export default function LoginPage() { return <AccountShell><AuthForm mode="login" /></AccountShell>; }
