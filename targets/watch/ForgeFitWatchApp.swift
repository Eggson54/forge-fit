import SwiftUI
import HealthKit

@main
struct ForgeFitWatchApp: App {
  @StateObject private var workout = WorkoutManager()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(workout)
    }
  }
}

/// Which screen the watch shows.
///
/// Driven entirely by the workout phase rather than by navigation state. A
/// watch app gets backgrounded and resumed constantly mid-run, and a
/// NavigationStack that has to be restored to the right place is the usual
/// source of "my watch went back to the start screen" complaints. Deriving
/// the screen from the session means there is no place to restore.
struct RootView: View {
  @EnvironmentObject private var workout: WorkoutManager

  var body: some View {
    switch workout.phase {
    case .idle:
      StartView()
    case .requesting:
      ProgressView("Starting…")
    case .running, .paused, .ending:
      SessionView()
    case .failed(let reason):
      FailureView(reason: reason)
    }
  }
}

struct FailureView: View {
  @EnvironmentObject private var workout: WorkoutManager
  let reason: String

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        Text("Could not record")
          .font(.headline)
        Text(reason)
          .font(.footnote)
          .foregroundStyle(.secondary)
        Button("Try again") {
          workout.start()
        }
        .tint(.orange)
      }
      .padding(.horizontal, 4)
    }
  }
}
