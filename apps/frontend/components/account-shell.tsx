import type { ReactNode } from 'react';
import styles from '../app/page.module.css';
export function AccountShell({ children }: { children: ReactNode }) { return <section className={styles.card}>{children}</section>; }
