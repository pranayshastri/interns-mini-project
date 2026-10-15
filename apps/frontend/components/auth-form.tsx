"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "./providers";
import { internalPath } from "../lib/contracts";
import { accountRequest } from "../lib/graphql-client";
import styles from "../app/page.module.css";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { config, refreshUser } = useApp();
  const signup = mode === "signup";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!config.auth) {
      setError("Account sign-in is temporarily unavailable.");
      return;
    }
    if (
      signup &&
      (Array.from(password).length < 8 ||
        new TextEncoder().encode(password).length > 72)
    ) {
      setError("Use at least 8 characters and no more than 72 UTF-8 bytes.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (signup) {
        await accountRequest(
          "mutation Register($email:String!,$password:String!,$fullName:String!){register(email:$email,password:$password,fullName:$fullName){user{id}}}",
          { email, password, fullName },
        );
        setCreated(true);
      } else {
        await accountRequest(
          "mutation Login($email:String!,$password:String!){login(email:$email,password:$password){user{id}}}",
          { email, password },
        );
        await refreshUser(true);
        router.replace(
          internalPath(
            new URLSearchParams(window.location.search).get("returnTo"),
          ),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
      setPassword("");
      setVisible(false);
    }
  }

  if (created)
    return (
      <>
        <h1>Account created</h1>
        <p className={styles.success} role="status">
          Your account has been created. Sign in with your email and password.
        </p>
        <Link
          className={`${styles.primary} ${styles.buttonLink}`}
          href="/login"
        >
          Continue to sign in
        </Link>
      </>
    );

  return (
    <>
      {!config.auth && (
        <p className="notice">Account sign-in is temporarily unavailable.</p>
      )}
      <h1>{signup ? "Create an account" : "Sign in"}</h1>
      <p className={styles.subtitle}>
        {signup
          ? "Create your customer account. You’ll sign in after registration."
          : "Sign in with your email and password. Customers, shopkeepers and administrators use this same form."}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <noscript>
        <p className={styles.error}>Enable JavaScript to use your account.</p>
      </noscript>
      <form onSubmit={submit} className={styles.form} aria-busy={busy}>
        {signup && (
          <div className={styles.field}>
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              name="fullName"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              maxLength={128}
              disabled={busy || !config.auth}
            />
          </div>
        )}
        <div className={styles.field}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={255}
            disabled={busy || !config.auth}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <div className={styles.passwordField}>
            <input
              id="password"
              name="password"
              type={visible ? "text" : "password"}
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={signup ? 8 : 1}
              disabled={busy || !config.auth}
              aria-describedby={signup ? "password-hint" : undefined}
            />
            <button
              type="button"
              className={styles.reveal}
              onClick={() => setVisible(!visible)}
              aria-controls="password"
              aria-label={visible ? "Hide password" : "Show password"}
              aria-pressed={visible}
              disabled={busy || !config.auth}
            >
              {visible ? "Hide" : "Show"}
            </button>
          </div>
          {signup && (
            <p id="password-hint" className={styles.hint}>
              At least 8 characters, A longer, unique passphrase is safer.
            </p>
          )}
        </div>
        <button
          type="submit"
          className={styles.primary}
          disabled={busy || !config.auth}
        >
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className={styles.switchMode}>
        {signup ? "Already have an account?" : "New to RoboNest?"}{" "}
        <Link href={signup ? "/login" : "/signup"}>
          {signup ? "Sign in" : "Create account"}
        </Link>
      </p>
    </>
  );
}
