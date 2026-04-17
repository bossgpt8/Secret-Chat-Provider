/**
 * Expo config plugin that wires up custom Android native modules.
 */

const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const KOTLIN_SRC_DIR = path.join(__dirname, "kotlin");
const XML_SRC_DIR = path.join(__dirname, "xml");

const KOTLIN_FILES = [
  "AudioControlModule.kt",
  "AudioControlPackage.kt",
  "SystemPermissionsModule.kt",
  "SystemPermissionsPackage.kt",
  "ScreenLockModule.kt",
  "ScreenLockPackage.kt",
  "ZenoDeviceAdmin.kt",
  "NotificationListenerModule.kt",
  "NotificationListenerPackage.kt",
  "ZenoNotificationService.kt",
  "AccessibilityModule.kt",
  "AccessibilityPackage.kt",
  "ZenoAccessibilityService.kt",
  "MediaControlModule.kt",
  "MediaControlPackage.kt",
  "CallScreeningModule.kt",
  "CallScreeningPackage.kt",
];

function javaDir(projectRoot) {
  return path.join(projectRoot, "android/app/src/main/java/com/boss/assistant");
}

function xmlResDir(projectRoot) {
  return path.join(projectRoot, "android/app/src/main/res/xml");
}

const withKotlinSources = (config) =>
  withDangerousMod(config, [
    "android",
    (config) => {
      const root = config.modRequest.projectRoot;
      const dest = javaDir(root);
      fs.mkdirSync(dest, { recursive: true });

      for (const file of KOTLIN_FILES) {
        fs.copyFileSync(path.join(KOTLIN_SRC_DIR, file), path.join(dest, file));
      }

      const resDir = xmlResDir(root);
      fs.mkdirSync(resDir, { recursive: true });
      fs.copyFileSync(
        path.join(XML_SRC_DIR, "device_admin.xml"),
        path.join(resDir, "device_admin.xml")
      );
      fs.copyFileSync(
        path.join(XML_SRC_DIR, "accessibility_service_config.xml"),
        path.join(resDir, "accessibility_service_config.xml")
      );

      return config;
    },
  ]);

const withAndroidManifestEntries = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    if (!app.service) app.service = [];
    const serviceExists = app.service.some(
      (s) => s.$ && s.$["android:name"] === ".ZenoNotificationService"
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

    const accessibilityServiceExists = app.service.some(
      (s) => s.$ && s.$["android:name"] === ".ZenoAccessibilityService"
    );
    if (!accessibilityServiceExists) {
      app.service.push({
        $: {
          "android:name": ".ZenoAccessibilityService",
          "android:label": "Zeno Assistant",
          "android:permission": "android.permission.BIND_ACCESSIBILITY_SERVICE",
          "android:exported": "true",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name": "android.accessibilityservice.AccessibilityService",
                },
              },
            ],
          },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.accessibilityservice",
              "android:resource": "@xml/accessibility_service_config",
            },
          },
        ],
      });
    }

    if (!app.receiver) app.receiver = [];
    const receiverExists = app.receiver.some(
      (r) => r.$ && r.$["android:name"] === ".ZenoDeviceAdmin"
    );
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

const PACKAGES = [
  "AudioControlPackage()",
  "SystemPermissionsPackage()",
  "ScreenLockPackage()",
  "NotificationListenerPackage()",
  "AccessibilityPackage()",
  "MediaControlPackage()",
  "CallScreeningPackage()",
];

const MARKER = "// [ZenoNativePackages]";

const withMainApplicationPackages = (config) =>
  withDangerousMod(config, [
    "android",
    (config) => {
      const root = config.modRequest.projectRoot;
      const mainAppPath = path.join(javaDir(root), "MainApplication.kt");

      if (!fs.existsSync(mainAppPath)) return config;

      let content = fs.readFileSync(mainAppPath, "utf8");
      if (content.includes(MARKER)) return config;

      const packageAdditions = PACKAGES.map((p) => `          add(${p})`).join("\n");
      const injection = `${MARKER}\n${packageAdditions}`;

      if (content.includes("PackageList(this).packages.apply {")) {
        content = content.replace(
          "PackageList(this).packages.apply {",
          `PackageList(this).packages.apply {\n${injection}`
        );
      } else if (content.includes("val packages = PackageList(this).packages")) {
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

const withNativeModules = (config) => {
  config = withKotlinSources(config);
  config = withAndroidManifestEntries(config);
  config = withMainApplicationPackages(config);
  return config;
};

module.exports = withNativeModules;
module.exports.default = withNativeModules;
