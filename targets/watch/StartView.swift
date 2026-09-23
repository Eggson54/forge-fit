import SwiftUI
import HealthKit

/// Picking what you are about to do, and starting it.
///
/// Four activities, not forty. A watch list you have to scroll through
/// while standing in the cold is worse than a short one that covers most
/// days; anything else can be recorded on the phone, which is where the
/// long list already lives.
struct StartView: View {
  @EnvironmentObject private var workout: WorkoutManager

  private static let activities: [(HKWorkoutActivityType, String, String)] = [
    (.running, "Run", "figure.run"),
    (.cycling, "Ride", "figure.outdoor.cycle"),
    (.walking, "Walk", "figure.walk"),
    (.traditionalStrengthTraining, "Lift", "dumbbell"),
  ]

  var body: some View {
    ScrollView {
      VStack(spacing: 6) {
        ForEach(Self.activities, id: \.0) { type, label, symbol in
          Button {
            workout.activity = type
            workout.start()
          } label: {
            HStack {
              Image(systemName: symbol)
                .frame(width: 24)
              Text(label)
              Spacer()
            }
            .padding(.vertical, 2)
          }
          .tint(.orange)
        }
      }
      .padding(.horizontal, 2)
    }
    .navigationTitle("ForgeFit")
    .task {
      // Asked once, on first appearance, rather than at the moment the
      // athlete taps Start — a permission sheet between "go" and the timer
      // starting costs them the first thirty seconds of the run.
      await workout.requestAuthorization()
    }
  }
}
