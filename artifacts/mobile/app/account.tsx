import { useAuth, useSignIn, useSignUp, useSSO, useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "@/context/AccountContext";
import { useColors } from "@/hooks/useColors";

WebBrowser.maybeCompleteAuthSession();

type Colors = ReturnType<typeof useColors>;
type Mode = "signIn" | "signUp" | "reset";

function errText(e: unknown, fallback: string): string {
  if (!e) return fallback;
  const any = e as { longMessage?: string; message?: string; errors?: Array<{ longMessage?: string; message?: string }> };
  return any.errors?.[0]?.longMessage ?? any.errors?.[0]?.message ?? any.longMessage ?? any.message ?? fallback;
}

async function attempt(setError: (m: string | null) => void, fallback: string, fn: () => Promise<void>) {
  setError(null);
  try { await fn(); } catch (e) { setError(errText(e, fallback)); }
}

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/* ── Shared UI ───────────────────────────────────────────── */

function Field({ label, testID, colors, ...props }: React.ComponentProps<typeof TextInput> & { label: string; colors: Colors; testID: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput testID={testID} accessibilityLabel={label} placeholderTextColor={colors.mutedForeground}
        style={[s.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} {...props} />
    </View>
  );
}

function Btn({ label, onPress, colors, testID, kind = "primary", busy, disabled, icon }: {
  label: string; onPress: () => void; colors: Colors; testID: string; kind?: "primary" | "ghost" | "danger" | "outline"; busy?: boolean; disabled?: boolean; icon?: string;
}) {
  const bg = kind === "primary" ? colors.primary : kind === "danger" ? colors.destructive : "transparent";
  const fg = kind === "primary" || kind === "danger" ? "#fff" : kind === "outline" ? colors.foreground : colors.primary;
  const off = disabled || busy;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off} onPress={onPress}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, borderColor: kind === "outline" ? colors.border : bg, opacity: off ? 0.5 : pressed ? 0.85 : 1 }]}>
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon as "mic"} size={17} color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function Notice({ text, tone, colors }: { text: string; tone: "error" | "info"; colors: Colors }) {
  const c = tone === "error" ? colors.destructive : colors.accent;
  return (
    <View accessibilityLiveRegion="polite" style={[s.notice, { backgroundColor: c + "18", borderColor: c + "55" }]}>
      <Ionicons name={tone === "error" ? "alert-circle-outline" : "information-circle-outline"} size={16} color={c} />
      <Text style={[s.noticeText, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

/* ── Screen ──────────────────────────────────────────────── */

export default function AccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="account-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={leave}
          style={[s.backBtn, { backgroundColor: colors.primary + "18" }]}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.crumb, { color: colors.mutedForeground }]}>Settings</Text>
          <Text style={[s.title, { color: colors.foreground }]}>Account & Cloud</Text>
        </View>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: bottomPad + 40 }}>
        {account.configured && !account.isLoaded ? (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityLabel="Loading account">
            {[60, 90, 40].map((w) => <View key={w} style={[s.skel, { width: `${w}%`, backgroundColor: colors.muted }]} />)}
          </View>
        ) : !account.configured ? (
          <View testID="account-unavailable" style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.heroIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="cloud-offline-outline" size={26} color={colors.mutedForeground} />
            </View>
            <Text style={[s.h2, { color: colors.foreground }]}>Cloud accounts aren't set up</Text>
            <Text style={[s.body, { color: colors.mutedForeground }]}>
              This build of Vox has no sign-in service configured, so accounts and sync are unavailable. Everything keeps working in guest mode and stays on this device.
            </Text>
            <Btn testID="account-guest-continue" label="Continue as guest" onPress={leave} colors={colors} kind="outline" icon="person-outline" />
          </View>
        ) : (
          <ClerkArea colors={colors} />
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

function ClerkArea({ colors }: { colors: Colors }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return (
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityLabel="Loading account">
        {[60, 90, 40].map((w) => <View key={w} style={[s.skel, { width: `${w}%`, backgroundColor: colors.muted }]} />)}
      </View>
    );
  }
  return isSignedIn ? <SignedIn colors={colors} /> : <AuthForms colors={colors} />;
}

/* ── Signed out ──────────────────────────────────────────── */

function AuthForms({ colors }: { colors: Colors }) {
  const [mode, setMode] = useState<Mode>("signIn");
  return (
    <>
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[s.heroIcon, { backgroundColor: colors.primary + "1c" }]}>
          <Ionicons name="cloud-outline" size={26} color={colors.primary} />
        </View>
        <Text style={[s.h2, { color: colors.foreground }]}>
          {mode === "signIn" ? "Sign in to sync Vox" : mode === "signUp" ? "Create your Vox account" : "Reset your password"}
        </Text>
        <Text style={[s.body, { color: colors.mutedForeground }]}>
          Back up conversations and settings, and pick up where you left off on another phone. Optional: Vox works fully without an account.
        </Text>
        {mode !== "reset" && <GoogleButton colors={colors} />}
        {mode !== "reset" && (
          <View style={s.divider}>
            <View style={[s.rule, { backgroundColor: colors.border }]} />
            <Text style={[s.label, { color: colors.mutedForeground }]}>or with email</Text>
            <View style={[s.rule, { backgroundColor: colors.border }]} />
          </View>
        )}
        {mode === "signIn" && <SignInForm colors={colors} onForgot={() => setMode("reset")} />}
        {mode === "signUp" && <SignUpForm colors={colors} />}
        {mode === "reset" && <ResetForm colors={colors} onDone={() => setMode("signIn")} />}
      </View>
      <View style={{ gap: 8 }}>
        {mode === "signIn" ? (
          <Btn testID="account-switch-signup" label="New here? Create an account" onPress={() => setMode("signUp")} colors={colors} kind="ghost" />
        ) : (
          <Btn testID="account-switch-signin" label={mode === "reset" ? "Back to sign in" : "Have an account? Sign in"} onPress={() => setMode("signIn")} colors={colors} kind="ghost" />
        )}
        <Btn testID="account-guest-exit" label="Keep using Vox as a guest" onPress={leave} colors={colors} kind="outline" icon="person-outline" />
      </View>
    </>
  );
}

function GoogleButton({ colors }: { colors: Colors }) {
  const { startSSOFlow } = useSSO();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);

  async function go() {
    setBusy(true); setError(null);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: Linking.createURL("account"),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setError("Google sign-in needs more information before it can finish. Try email sign-in instead.");
      }
    } catch (e) {
      setError(errText(e, "Google sign-in was cancelled or failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Btn testID="account-google" label="Continue with Google" onPress={go} colors={colors} kind="outline" icon="logo-google" busy={busy} />
      {error && <Notice text={error} tone="error" colors={colors} />}
    </View>
  );
}

function SignInForm({ colors, onForgot }: { colors: Colors; onForgot: () => void }) {
  const { signIn, errors, fetchStatus } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = fetchStatus === "fetching";

  async function finish() {
    await signIn.finalize({
      navigate: ({ session }) => {
        if (session?.currentTask) setError("Your account needs an extra step that this app can't complete yet.");
      },
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const submit = () => attempt(setError, "Couldn't sign in.", async () => {
    const { error: e } = await signIn.password({ emailAddress: email.trim(), password });
    if (e) { setError(errText(e, "Couldn't sign in.")); return; }
    if (signIn.status === "complete") await finish();
    else if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
      const hasEmail = signIn.supportedSecondFactors?.some((f) => f.strategy === "email_code");
      if (hasEmail) {
        const r = await signIn.mfa.sendEmailCode();
        if (r?.error) setError(errText(r.error, "Couldn't send a verification code."));
      } else setError("This account requires a second factor that Vox doesn't support yet.");
    } else setError("Sign-in couldn't be completed. Please try again.");
  });

  const verify = () => attempt(setError, "That code didn't work.", async () => {
    const { error: e } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
    if (e) { setError(errText(e, "That code didn't work.")); return; }
    if (signIn.status === "complete") await finish();
    else setError("Verification didn't complete. Request a new code.");
  });

  const resend = () => attempt(setError, "Couldn't send a new code.", async () => {
    const r = await signIn.mfa.sendEmailCode();
    if (r?.error) setError(errText(r.error, "Couldn't send a new code."));
  });

  const restart = () => attempt(setError, "Couldn't reset sign-in.", async () => {
    await signIn.reset();
    setCode("");
  });

  if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
    return (
      <View style={{ gap: 12 }}>
        <Notice text={`We sent a code to ${email || "your email"}.`} tone="info" colors={colors} />
        <Field testID="signin-code" label="Verification code" colors={colors} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" returnKeyType="done" onSubmitEditing={verify} />
        {errors.fields.code && <Notice text={errors.fields.code.message} tone="error" colors={colors} />}
        {error && <Notice text={error} tone="error" colors={colors} />}
        <Btn testID="signin-verify" label="Verify" onPress={verify} colors={colors} busy={busy} disabled={!code.trim()} />
        <Btn testID="signin-resend" label="Send a new code" onPress={() => { void resend(); }} colors={colors} kind="ghost" />
        <Btn testID="signin-restart" label="Start over" onPress={() => { void restart(); }} colors={colors} kind="ghost" />
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Field testID="signin-email" label="Email" colors={colors} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" />
      {errors.fields.identifier && <Notice text={errors.fields.identifier.message} tone="error" colors={colors} />}
      <Field testID="signin-password" label="Password" colors={colors} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
      {errors.fields.password && <Notice text={errors.fields.password.message} tone="error" colors={colors} />}
      {error && <Notice text={error} tone="error" colors={colors} />}
      <Btn testID="signin-submit" label="Sign in" onPress={submit} colors={colors} busy={busy} disabled={!email.trim() || !password} />
      <Btn testID="signin-forgot" label="Forgot password?" onPress={onForgot} colors={colors} kind="ghost" />
    </View>
  );
}

function SignUpForm({ colors }: { colors: Colors }) {
  const { signUp, errors, fetchStatus } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = fetchStatus === "fetching";

  const submit = () => attempt(setError, "Couldn't create the account.", async () => {
    const { error: e } = await signUp.password({ emailAddress: email.trim(), password });
    if (e) { setError(errText(e, "Couldn't create the account.")); return; }
    const r = await signUp.verifications.sendEmailCode();
    if (r?.error) setError(errText(r.error, "Couldn't send a verification code."));
  });

  const resend = () => attempt(setError, "Couldn't send a new code.", async () => {
    const r = await signUp.verifications.sendEmailCode();
    if (r?.error) setError(errText(r.error, "Couldn't send a new code."));
  });

  const verify = () => attempt(setError, "That code didn't work.", async () => {
    const v = await signUp.verifications.verifyEmailCode({ code: code.trim() });
    if (v?.error) { setError(errText(v.error, "That code didn't work.")); return; }
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: ({ session }) => {
          if (session?.currentTask) setError("Your account needs an extra step that this app can't complete yet.");
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (!errors.fields.code) {
      setError("Verification didn't complete. Check the code or request a new one.");
    }
  });

  const awaitingCode = signUp.status === "missing_requirements" && signUp.unverifiedFields.includes("email_address") && signUp.missingFields.length === 0;

  if (awaitingCode) {
    return (
      <View style={{ gap: 12 }}>
        <Notice text={`Enter the code we sent to ${email || "your email"}.`} tone="info" colors={colors} />
        <Field testID="signup-code" label="Verification code" colors={colors} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" returnKeyType="done" onSubmitEditing={verify} />
        {errors.fields.code && <Notice text={errors.fields.code.message} tone="error" colors={colors} />}
        {error && <Notice text={error} tone="error" colors={colors} />}
        <Btn testID="signup-verify" label="Verify email" onPress={verify} colors={colors} busy={busy} disabled={!code.trim()} />
        <Btn testID="signup-resend" label="Send a new code" onPress={() => { void resend(); }} colors={colors} kind="ghost" />
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Field testID="signup-email" label="Email" colors={colors} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" />
      {errors.fields.emailAddress && <Notice text={errors.fields.emailAddress.message} tone="error" colors={colors} />}
      <Field testID="signup-password" label="Password" colors={colors} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={submit} />
      {errors.fields.password && <Notice text={errors.fields.password.message} tone="error" colors={colors} />}
      {error && <Notice text={error} tone="error" colors={colors} />}
      <Btn testID="signup-submit" label="Create account" onPress={submit} colors={colors} busy={busy} disabled={!email.trim() || !password} />
      <View nativeID="clerk-captcha" />
    </View>
  );
}

function ResetForm({ colors, onDone }: { colors: Colors; onDone: () => void }) {
  const { signIn, errors, fetchStatus } = useSignIn();
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = fetchStatus === "fetching";

  const sendCode = () => attempt(setError, "Couldn't send a reset code.", async () => {
    const created = await signIn.create({ identifier: email.trim() });
    if (created.error) { setError(errText(created.error, "We couldn't find that account.")); return; }
    const sent = await signIn.resetPasswordEmailCode.sendCode();
    if (sent.error) { setError(errText(sent.error, "Couldn't send a reset code.")); return; }
    setStep("code");
  });

  const resendCode = () => attempt(setError, "Couldn't send a new code.", async () => {
    const r = await signIn.resetPasswordEmailCode.sendCode();
    if (r.error) setError(errText(r.error, "Couldn't send a new code."));
  });

  const verifyCode = () => attempt(setError, "That code didn't work.", async () => {
    const r = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
    if (r.error) { setError(errText(r.error, "That code didn't work.")); return; }
    setStep("password");
  });

  const submitPassword = () => attempt(setError, "Couldn't set the new password.", async () => {
    const r = await signIn.resetPasswordEmailCode.submitPassword({ password });
    if (r.error) { setError(errText(r.error, "Couldn't set the new password.")); return; }
    if (signIn.status === "complete") {
      await signIn.finalize();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setError("Password updated, but sign-in needs another step. Sign in with your new password.");
      onDone();
    }
  });

  return (
    <View style={{ gap: 12 }}>
      {step === "email" && (
        <>
          <Field testID="reset-email" label="Account email" colors={colors} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" returnKeyType="send" onSubmitEditing={sendCode} />
          {error && <Notice text={error} tone="error" colors={colors} />}
          <Btn testID="reset-send" label="Email me a reset code" onPress={sendCode} colors={colors} busy={busy} disabled={!email.trim()} />
        </>
      )}
      {step === "code" && (
        <>
          <Notice text={`Reset code sent to ${email}.`} tone="info" colors={colors} />
          <Field testID="reset-code" label="Reset code" colors={colors} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" returnKeyType="done" onSubmitEditing={verifyCode} />
          {errors.fields.code && <Notice text={errors.fields.code.message} tone="error" colors={colors} />}
          {error && <Notice text={error} tone="error" colors={colors} />}
          <Btn testID="reset-verify" label="Verify code" onPress={verifyCode} colors={colors} busy={busy} disabled={!code.trim()} />
          <Btn testID="reset-resend" label="Send a new code" onPress={() => { void resendCode(); }} colors={colors} kind="ghost" />
        </>
      )}
      {step === "password" && (
        <>
          <Field testID="reset-password" label="New password" colors={colors} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" returnKeyType="done" onSubmitEditing={submitPassword} />
          {errors.fields.password && <Notice text={errors.fields.password.message} tone="error" colors={colors} />}
          {error && <Notice text={error} tone="error" colors={colors} />}
          <Btn testID="reset-submit" label="Save new password" onPress={submitPassword} colors={colors} busy={busy} disabled={password.length < 8} />
        </>
      )}
    </View>
  );
}

/* ── Signed in ───────────────────────────────────────────── */

type Confirm = null | "merge" | "resolve" | "erase" | "delete";

function SignedIn({ colors }: { colors: Colors }) {
  const account = useAccount();
  const { user } = useUser();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>, okText: string) {
    setBusy(key); setError(null); setDone(null);
    try {
      await fn();
      setDone(okText);
      setConfirm(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(errText(e, "Something went wrong. Nothing was changed."));
    } finally {
      setBusy(null);
    }
  }

  const hasConflict = !!account.error && /changed|conflict/i.test(account.error);
  const email = user?.primaryEmailAddress?.emailAddress ?? "Signed in";
  const initials = (user?.firstName?.[0] ?? email[0] ?? "V").toUpperCase();
  const last = account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString() : "Never";

  const confirmCopy: Record<Exclude<Confirm, null>, { title: string; body: string; action: string; kind: "primary" | "danger" }> = {
    merge: { title: "Merge guest data into this account?", body: "Only your conversations and supported preferences on this phone are uploaded and combined with your cloud data. Notes, to-dos and other local data are not uploaded. Nothing on this phone is deleted.", action: "Merge now", kind: "primary" },
    resolve: { title: "Combine this phone with the cloud?", body: "Conversations from both places are combined. If the same chat exists in both, the newer version is kept. Preferences on this phone are kept. Chats you deleted on one device may come back.", action: "Combine", kind: "primary" },
    erase: { title: "Erase all cloud data?", body: "Your synced backups are permanently removed from the server, and the synced account copy on this phone is cleared too. Guest data that was never synced stays. Your account remains.", action: "Erase cloud data", kind: "danger" },
    delete: { title: "Delete your account permanently?", body: "Cloud data and the synced account copy on this phone are erased first, then your account is deleted and Vox returns to guest mode. This can't be undone.", action: "Delete account", kind: "danger" },
  };

  return (
    <>
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={[s.avatar, { backgroundColor: colors.primary }]}><Text style={s.avatarText}>{initials}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.h3, { color: colors.foreground }]} numberOfLines={1}>{email}</Text>
            <Text style={[s.body, { color: colors.mutedForeground }]}>Status: {account.syncStatus} · Last sync: {last}</Text>
          </View>
        </View>
        {account.error && <Notice text={account.error} tone="error" colors={colors} />}
        {hasConflict && (
          <Btn testID="account-resolve-conflict" label="Resolve cloud conflict" icon="git-compare-outline" disabled={!!busy}
            onPress={() => setConfirm("resolve")} colors={colors} kind="outline" />
        )}
        <Btn testID="account-sync" label="Sync now" icon="sync-outline" busy={busy === "sync"} disabled={!!busy}
          onPress={() => run("sync", account.syncNow, "Sync finished.")} colors={colors} />
        <Btn testID="account-merge" label="Merge guest data from this phone" icon="git-merge-outline" disabled={!!busy}
          onPress={() => setConfirm("merge")} colors={colors} kind="outline" />
      </View>

      {confirm && (
        <View testID={`account-confirm-${confirm}`} style={[s.card, { backgroundColor: colors.card, borderColor: confirmCopy[confirm].kind === "danger" ? colors.destructive + "88" : colors.primary + "88" }]}>
          <Text style={[s.h3, { color: colors.foreground }]}>{confirmCopy[confirm].title}</Text>
          <Text style={[s.body, { color: colors.mutedForeground }]}>{confirmCopy[confirm].body}</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Btn testID="account-confirm-cancel" label="Cancel" onPress={() => setConfirm(null)} colors={colors} kind="outline" disabled={!!busy} /></View>
            <View style={{ flex: 1 }}>
              <Btn testID="account-confirm-ok" label={confirmCopy[confirm].action} kind={confirmCopy[confirm].kind} colors={colors} busy={!!busy}
                onPress={() => {
                  if (confirm === "merge") void run("merge", account.importGuest, "Guest data merged into your account.");
                  else if (confirm === "resolve") void run("resolve", account.mergeCloud, "This phone and the cloud were combined.");
                  else if (confirm === "erase") void run("erase", account.deleteCloud, "Cloud data and this phone's synced copy erased.");
                  else void run("delete", async () => {
                    if (!user) throw new Error("Account not loaded yet. Try again in a moment.");
                    await account.deleteCloud();
                    await user.delete();
                    await account.signOut().catch(() => {});
                  }, "Account deleted. Vox is back in guest mode.");
                }} />
            </View>
          </View>
        </View>
      )}

      {error && <Notice text={error} tone="error" colors={colors} />}
      {done && <Notice text={done} tone="info" colors={colors} />}

      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Btn testID="account-signout" label="Sign out" icon="log-out-outline" busy={busy === "signout"} disabled={!!busy}
          onPress={() => run("signout", account.signOut, "Signed out. Vox keeps working in guest mode.")} colors={colors} kind="outline" />
        <Text style={[s.label, { color: colors.mutedForeground, marginTop: 6 }]}>Danger zone</Text>
        <Btn testID="account-erase-cloud" label="Erase cloud data" icon="cloud-offline-outline" disabled={!!busy}
          onPress={() => setConfirm("erase")} colors={colors} kind="ghost" />
        <Btn testID="account-delete" label="Delete account" icon="trash-outline" disabled={!!busy}
          onPress={() => setConfirm("delete")} colors={colors} kind="danger" />
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  crumb: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 1 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  card: { borderRadius: 18, borderWidth: 1, padding: 18, gap: 12 },
  heroIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  h2: { fontSize: 20, fontFamily: "Inter_700Bold" },
  h3: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  body: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  label: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.8 },
  input: { height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15, fontFamily: "Inter_500Medium" },
  btn: { minHeight: 46, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14 },
  btnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  divider: { flexDirection: "row", alignItems: "center", gap: 10 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  skel: { height: 14, borderRadius: 7 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
});
