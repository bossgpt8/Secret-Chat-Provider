# Standalone Clerk setup for Vox

Vox defaults to the Replit-managed Clerk configuration in the Replit app. That keeps the current Replit development login working. Set `CLERK_AUTH_MODE=standalone` only on a server configured with your own Clerk application; standalone mode bypasses Replit's Clerk proxy and requires both server keys.

## GitHub Actions native builds

Create a GitHub repository variable named `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` with the publishable key from your standalone Clerk application. The Android and iOS workflows pass it to the Expo bundle. Without it, the build warns and the app remains in guest mode.

## Oracle API server

Set these in the Oracle host's secure environment settings, then restart the API:

- `CLERK_AUTH_MODE=standalone`
- `CLERK_PUBLISHABLE_KEY` — publishable key from the same Clerk application
- `CLERK_SECRET_KEY` — secret key from that Clerk application

Never put the secret key in the mobile app, source control, or a GitHub Actions variable.

## EAS builds

EAS runs the mobile build remotely, so configure `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in the matching EAS environment as well. A GitHub Actions repository variable is not automatically copied to EAS.

## Before sign-in

Enable the desired sign-in methods in the standalone Clerk application and configure its allowed origins and OAuth redirect URLs for Vox. Replit-managed development and production accounts are separate; a standalone Clerk application has its own user IDs. Existing cloud records are not automatically reassigned to new Clerk accounts.
