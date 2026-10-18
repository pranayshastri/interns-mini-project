import styles from './brand-logo.module.css';

/** Brand clicks intentionally reload home, even when already on home. */
export function BrandLogo({ className = 'brand' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- Full document navigation is the requested brand behavior.
    <a href="/" className={`${className} ${styles.logo}`} aria-label="RoboNest home">
      {/* eslint-disable-next-line @next/next/no-img-element -- Use the same supplied robot artwork as the favicon. */}
      <img src="/icon.svg" alt="" aria-hidden="true" width={34} height={34} />
      <span className={styles.wordmark}>robonest<span className="brand-period">.</span></span>
    </a>
  );
}
