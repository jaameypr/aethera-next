"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Shield, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useLocale } from "@/context/locale-context";

export default function SetupPage() {
  const router = useRouter();
  const { t } = useLocale();
  const [username, setUsername] = useState("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/setup")
      .then((res) => res.json())
      .then((data) => {
        if (!data.needsSetup) {
          router.replace("/login");
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        setChecking(false);
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("profile.passwordMismatch"));
      return;
    }

    if (password.length < 8) {
      setError(t("profile.passwordTooShort"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email: email || undefined, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("common.error"));
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="animate-pulse-soft text-muted-foreground">{t("auth.setup.checkingStatus")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
      }}
    >
      <Card className="shadow-z3">
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 12 },
            show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
          }}
        >
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-glow-brand">
              <Shield className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">{t("auth.setup.title")}</CardTitle>
            <CardDescription>{t("auth.setup.description")}</CardDescription>
          </CardHeader>
        </motion.div>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex animate-shake items-start gap-2 rounded-md border-l-4 border-destructive bg-destructive-muted p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <motion.div
            className="space-y-2"
            variants={{
              hidden: { opacity: 0, y: 10 },
              show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
            }}
          >
            <Label htmlFor="username">{t("auth.setup.username")}</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
            />
          </motion.div>
          <motion.div
            className="space-y-2"
            variants={{
              hidden: { opacity: 0, y: 10 },
              show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
            }}
          >
            <Label htmlFor="email">{t("auth.setup.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </motion.div>
          <motion.div
            className="space-y-2"
            variants={{
              hidden: { opacity: 0, y: 10 },
              show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
            }}
          >
            <Label htmlFor="password">{t("auth.setup.password")}</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.setup.passwordHint")}
              required
            />
          </motion.div>
          <motion.div
            className="space-y-2"
            variants={{
              hidden: { opacity: 0, y: 10 },
              show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
            }}
          >
            <Label htmlFor="confirmPassword">{t("auth.setup.confirmPassword")}</Label>
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("auth.setup.repeatPassword")}
              required
            />
          </motion.div>
        </CardContent>
        <CardFooter>
          <Button type="submit" variant="brand" className="w-full" disabled={loading}>
            {loading ? t("auth.setup.creatingAccount") : t("auth.setup.createAccount")}
          </Button>
        </CardFooter>
      </form>
      </Card>
    </motion.div>
  );
}
