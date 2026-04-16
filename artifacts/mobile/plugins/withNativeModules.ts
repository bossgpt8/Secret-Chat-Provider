/**
 * Expo config plugin that wires up three custom Android native modules:
 *
 *  1. SystemPermissionsModule  – check / request WRITE_SETTINGS and SYSTEM_ALERT_WINDOW
 *  2. ScreenLockModule         – check / request Device Administrator, lock screen
 *  3. NotificationListenerModule – check / request Notification Listener access,
 *                                  read / reply to / dismiss notifications
 *
 * What this plugin does during `expo prebuild`:
 *  • Copies Kotlin source files from plugins/kotlin/ into the generated Android project.
 *  • Copies device_admin.xml resource from plugins/xml/ into res/xml/.
 *  • Adds the NotificationListenerService and DeviceAdminReceiver entries to AndroidManifest.xml.
 *  • Registers the three ReactPackages in MainApplication.kt.
 */

import {
  type ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} from "@expo/config-plugins";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KOTLIN_SRC_DIR = path.join(__dirname, "kotlin");
const XML_SRC_DIR = path.join(__dirname, "xml");

const KOTLIN_FILES = [
  "SystemPermissionsModule.kt",
  "SystemPermissionsPackage.kt",
  "ScreenLockModule.kt",
  "ScreenLockPackage.kt",
  "ZenoDeviceAdmin.kt",
  "NotificationListenerModule.kt",
  "NotificationListenerPackage.kt",
  "ZenoNotificationService.kt",
];

/** Resolves the com.boss.assistant java source directory inside the android project. */
function javaDir(projectRoot: string): string {
  return path.join(
    projectRoot,
    "android/app/src/main/java/com/boss/assistant"
  );
}

function xmlResDir(projectRoot: string): string {
  return path.join(projectRoot, "android/app/src/main/res/xml");
}

// ---------------------------------------------------------------------------
// Step 1 – copy Kotlin source files and device_admin.xml resource
// ---------------------------------------------------------------------------

const withKotlinSources: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    "android",
    (config) => {
      const root = config.modRequest.projectRoot;
      const dest = javaDir(root);
      fs.mkdirSync(dest, { recursive: true });

      for (const file of KOTLIN_FILES) {
        fs.copyFileSync(path.join(KOTLIN_SRC_DIR, file), path.join(dest, file));
      }

      // device_admin.xml
      const resDir = xmlResDir(root);
      fs.mkdirSync(resDir, { recursive: true });
      fs.copyFileSync(
        path.join(XML_SRC_DIR, "device_admin.xml"),
        path.join(resDir, "device_admin.xml")
      );

      return config;
    },
  ]);

// ---------------------------------------------------------------------------
// Step 2 – patch AndroidManifest.xml
// ---------------------------------------------------------------------------

const withAndroidManifestEntries: ConfigPlugin = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app: any =
      AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    // ── NotificationListenerService ───────────────────────────────────────
    if (!app.service) app.service = [];
    const serviceExists = (app.service as Array<{ $?: Record<string, string> }>).some(
      (s) => s.$?.["android:name"] === ".ZenoNotificationService"
    );
    if (!serviceExists) {
      app.service.push({
        $: {
          "android:name": ".ZenoNotificationService",
          "android:label": "Zeno Notification Listener",
          "android:permission":
            "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
          "android:exported": "true",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name":
                    "android.service.notification.NotificationListenerService",
                },
              },
            ],
          },
        ],
      });
    }

    // ── DeviceAdminReceiver ───────────────────────────────────────────────
    if (!app.receiver) app.receiver = [];
    const receiverExists = (
      app.receiver as Array<{ $?: Record<string, string> }>
    ).some((r) => r.$?.["android:name"] === ".ZenoDeviceAdmin");
    if (!receiverExists) {
      app.receiver.push({
        $: {
          "android:name": ".ZenoDeviceAdmin",
          "android:label": "Zeno Device Admin",
          "android:description": "@string/app_name",
          "android:permission": "android.permission.BIND_DEVICE_ADMIN",
          "android:exported": "true",
        },
        "meta-data": [
          {
            $: {
              "android:name": "android.app.device_admin",
              "android:resource": "@xml/device_admin",
            },
          },
        ],
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name": "android.app.action.DEVICE_ADMIN_ENABLED",
                },
              },
            ],
          },
        ],
      });
    }

    return config;
  });

// ---------------------------------------------------------------------------
// Step 3 – register ReactPackages in MainApplication.kt
// ---------------------------------------------------------------------------

const PACKAGES = [
  "SystemPermissionsPackage()",
  "ScreenLockPackage()",
  "NotificationListenerPackage()",
];

/** Marker inserted to detect that our packages have already been added (idempotency). */
const MARKER = "// [ZenoNativePackages]";

const withMainApplicationPackages: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    "android",
    (config) => {
      const root = config.modRequest.projectRoot;
      const mainAppPath = path.join(
        javaDir(root),
        "MainApplication.kt"
      );

      if (!fs.existsSync(mainAppPath)) return config;

      let content = fs.readFileSync(mainAppPath, "utf8");

      // Already patched – skip.
      if (content.includes(MARKER)) return config;

      const packageAdditions = PACKAGES.map((p) => `          add(${p})`).join(
        "\n"
      );
      const injection = `${MARKER}\n${packageAdditions}`;

      // Pattern A: `PackageList(this).packages.apply { … }` (new-arch template)
      if (content.includes("PackageList(this).packages.apply {")) {
        content = content.replace(
          "PackageList(this).packages.apply {",
          `PackageList(this).packages.apply {\n${injection}`
        );
      } else if (content.includes("val packages = PackageList(this).packages")) {
        // Pattern B: `val packages = PackageList(this).packages` (old template)
        // Each package.add() line needs 6-space indentation to match the block.
        const injectionB = PACKAGES.map((p) => `      packages.add(${p})`).join("\n");
        content = content.replace(
          "val packages = PackageList(this).packages",
          `val packages = PackageList(this).packages\n      ${MARKER}\n${injectionB}`
        );
      }

      fs.writeFileSync(mainAppPath, content, "utf8");
      return config;
    },
  ]);

// ---------------------------------------------------------------------------
// Compose all steps into a single plugin
// ---------------------------------------------------------------------------

const withNativeModules: ConfigPlugin = (config) => {
  config = withKotlinSources(config);
  config = withAndroidManifestEntries(config);
  config = withMainApplicationPackages(config);
  return config;
};

export default withNativeModules;
