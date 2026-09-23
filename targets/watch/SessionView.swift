import SwiftUI

/// The screen somebody looks at mid-run, usually for about a second.
///
/// Two design rules, both from that one second:
///
///  - **The time is the biggest thing on the wrist**, in a monospaced-digit
///    font. Proportional digits make the display twitch sideways every time a
///    1 becomes a 2, which is unreadable at a glance and maddening at a
///    glance you take while running.
///  - **Controls are behind a swipe, not under a thumb.** End and Pause sit
///    on a second page rather than on this one, because the most expensive
///    mistake this app can make is ending a workout that was not finished.
struct SessionView: View {
  @EnvironmentObject private var workout: WorkoutManager

  var body: some View {
    TabView {
      metrics
      controls
    }
    .tabViewStyle(.verticalPage)
  }

  private var metrics: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(Self.clock(workout.elapsed))
        .font(.system(size: 44, weight: .semibold, design: .rounded))
        .monospacedDigit()
        .foregroundStyle(workout.phase == .paused ? .secondary : .primary)
        .minimumScaleFactor(0.6)
        .lineLimit(1)

      if workout.phase == .paused {
        Text("Paused")
          .font(.caption2)
          .foregroundStyle(.orange)
      }

      Spacer(minLength: 4)

      Row(
        value: workout.heartRate > 0 ? String(Int(workout.heartRate.rounded())) : "—",
        unit: "bpm",
        symbol: "heart.fill",
        tint: .pink
      )
      Row(
        value: String(Int(workout.activeEnergyKcal.rounded())),
        unit: "kcal",
        symbol: "flame.fill",
        tint: .orange
      )
      // Hidden rather than shown as zero for a gym session: a lifting
      // workout has no distance, and a permanent 0.00 km reads like the
      // sensor is broken.
      if workout.distanceMeters > 0 {
        Row(
          value: String(format: "%.2f", workout.distanceMeters / 1000),
          unit: "km",
          symbol: "location.fill",
          tint: .cyan
        )
      }
    }
    .padding(.horizontal, 4)
  }

  private var controls: some View {
    VStack(spacing: 8) {
      Button {
        workout.phase == .paused ? workout.resume() : workout.pause()
      } label: {
        Label(workout.phase == .paused ? "Resume" : "Pause",
              systemImage: workout.phase == .paused ? "play.fill" : "pause.fill")
      }
      .tint(.yellow)

      Button {
        workout.end()
      } label: {
        Label("End", systemImage: "stop.fill")
      }
      .tint(.red)

      Text("Saved to Apple Health, where the ForgeFit app on your phone picks it up.")
        .font(.system(size: 11))
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    }
    .padding(.horizontal, 4)
  }

  /// `h:mm:ss` past an hour, `mm:ss` before it.
  ///
  /// Showing `0:07:32` for a seven-minute effort wastes two of the few
  /// characters that fit on a 40mm screen on a digit that is always zero.
  static func clock(_ interval: TimeInterval) -> String {
    let total = Int(max(0, interval.rounded()))
    let hours = total / 3600
    let minutes = (total % 3600) / 60
    let seconds = total % 60
    if hours > 0 {
      return String(format: "%d:%02d:%02d", hours, minutes, seconds)
    }
    return String(format: "%d:%02d", minutes, seconds)
  }
}

private struct Row: View {
  let value: String
  let unit: String
  let symbol: String
  let tint: Color

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: symbol)
        .font(.system(size: 12))
        .foregroundStyle(tint)
        .frame(width: 16)
      Text(value)
        .font(.system(size: 20, weight: .medium, design: .rounded))
        .monospacedDigit()
      Text(unit)
        .font(.system(size: 11))
        .foregroundStyle(.secondary)
      Spacer()
    }
  }
}
