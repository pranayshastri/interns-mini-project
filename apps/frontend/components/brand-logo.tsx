import styles from './brand-logo.module.css';

/** A document navigation intentionally reloads home, even from home itself. */
export function BrandLogo() {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- Brand clicks explicitly require a full reload.
    <a href="/" className={styles.logo} aria-label="RoboNest home">
      {/* eslint-disable-next-line @next/next/no-img-element -- Preserve the supplied logo without optimization or redrawing. */}
      <img src="/brand/robonest-logo.png" alt="RoboNest" width={2172} height={724} />
    </a>
  );
}
