import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    // Secure overlay shown when iOS detects screen capture/mirroring
    private var secureOverlay: UIView?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Listen for screen capture start/stop
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenCaptureDidChange),
            name: UIScreen.captureDidChangeNotification,
            object: nil
        )
        // Check immediately in case app launched while already being recorded
        updateSecureOverlay()
        return true
    }

    @objc private func screenCaptureDidChange() {
        updateSecureOverlay()
    }

    private func updateSecureOverlay() {
        DispatchQueue.main.async {
            if UIScreen.main.isCaptured {
                self.showSecureOverlay()
            } else {
                self.hideSecureOverlay()
            }
        }
    }

    private func showSecureOverlay() {
        guard secureOverlay == nil, let window = self.window else { return }
        let overlay = UIView(frame: window.bounds)
        overlay.backgroundColor = UIColor.black
        overlay.tag = 9999

        let label = UILabel()
        label.text = "Screen recording\nis not allowed"
        label.textColor = .white
        label.font = UIFont.systemFont(ofSize: 20, weight: .semibold)
        label.numberOfLines = 2
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
        ])

        window.addSubview(overlay)
        self.secureOverlay = overlay
    }

    private func hideSecureOverlay() {
        secureOverlay?.removeFromSuperview()
        secureOverlay = nil
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
